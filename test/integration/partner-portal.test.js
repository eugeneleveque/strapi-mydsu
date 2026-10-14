'use strict';

/**
 * /partner-portal : connexion des partenaires (depuis le blog) et gestion de
 * leurs propres activités.
 */

const { setupStrapi, stopStrapi } = require('../helpers/strapi');
const { api, createUser, unique } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('partner-portal'));
afterAll(() => stopStrapi());

const PASSWORD = 'motdepasse123';

async function createPartner(attributes = {}) {
  const email = attributes.email ?? `${unique('partenaire')}@test.fr`;
  const partner = await strapi.documents('api::partner.partner').create({
    data: { name: unique('Bar '), email, password: PASSWORD, states: 'active', ...attributes },
    status: 'published',
  });
  return { ...partner, email };
}

/** Crée un partenaire et le connecte. */
async function loggedPartner(attributes = {}) {
  const partner = await createPartner(attributes);
  const res = await api().post('/api/partner-portal/login').send({ email: partner.email, password: PASSWORD });
  return { ...partner, token: res.body.token };
}

const asPartner = (partner) => ({
  get: (url) => api().get(url).set('Authorization', `Bearer ${partner.token}`),
  post: (url) => api().post(url).set('Authorization', `Bearer ${partner.token}`),
  put: (url) => api().put(url).set('Authorization', `Bearer ${partner.token}`),
  delete: (url) => api().delete(url).set('Authorization', `Bearer ${partner.token}`),
});

const nouvelleActivite = (overrides = {}) => ({
  title: 'Soirée quiz',
  description: 'Un quiz en équipe',
  location: '12 rue de la Paix, Nantes',
  startDate: '2026-12-01T19:00:00.000Z',
  endDate: '2026-12-01T22:00:00.000Z',
  minParticipants: 2,
  maxParticipants: 6,
  price: 12.5,
  ...overrides,
});

describe('Connexion', () => {
  it('renvoie un jeton et le partenaire, sans le mot de passe', async () => {
    const partner = await createPartner({ email: 'Contact@Bar-Test.fr' });

    const res = await api()
      .post('/api/partner-portal/login')
      .send({ email: 'contact@bar-test.fr', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.partner).toMatchObject({ documentId: partner.documentId, name: partner.name });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('refuse un mauvais mot de passe ou un email inconnu avec le même message', async () => {
    const partner = await createPartner();

    const mauvais = await api().post('/api/partner-portal/login').send({ email: partner.email, password: 'faux' });
    const inconnu = await api().post('/api/partner-portal/login').send({ email: 'personne@test.fr', password: PASSWORD });

    expect(mauvais.status).toBe(401);
    expect(inconnu.status).toBe(401);
    expect(mauvais.body.error.message).toBe('Email ou mot de passe incorrect.');
    expect(inconnu.body.error.message).toBe(mauvais.body.error.message);
  });

  it('refuse un partenaire suspendu', async () => {
    const partner = await createPartner({ states: 'suspended' });
    const res = await api().post('/api/partner-portal/login').send({ email: partner.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/désactivé/);
  });

  it('exige email et mot de passe', async () => {
    expect((await api().post('/api/partner-portal/login').send({})).status).toBe(400);
  });
});

describe('Jeton partenaire', () => {
  it('donne accès au profil du partenaire', async () => {
    const partner = await loggedPartner();
    const res = await asPartner(partner).get('/api/partner-portal/me');
    expect(res.status).toBe(200);
    expect(res.body.data.documentId).toBe(partner.documentId);
  });

  it('est obligatoire', async () => {
    const sansJeton = await api().get('/api/partner-portal/activities');
    expect(sansJeton.status).toBe(401);
    expect(sansJeton.body.error.message).toMatch(/partenaire/);
    expect((await asPartner({ token: 'nimporte.quoi.123' }).get('/api/partner-portal/me')).status).toBe(401);
  });

  it('ne peut pas être remplacé par le JWT d’un utilisateur de l’app', async () => {
    const user = await createUser();
    expect((await asPartner({ token: user.jwt }).get('/api/partner-portal/me')).status).toBe(401);
  });

  it('n’est pas accepté comme JWT utilisateur', async () => {
    const partner = await loggedPartner();
    expect((await asPartner(partner).get('/api/users/me')).status).toBe(401);
  });

  it('cesse de fonctionner si le partenaire est suspendu', async () => {
    const partner = await loggedPartner();
    await strapi.documents('api::partner.partner').update({
      documentId: partner.documentId,
      data: { states: 'suspended' },
      status: 'published',
    });
    expect((await asPartner(partner).get('/api/partner-portal/activities')).status).toBe(401);
  });
});

describe('Activités', () => {
  it('crée une activité publiée, rattachée au partenaire et visible dans l’app', async () => {
    const partner = await loggedPartner();

    const res = await asPartner(partner).post('/api/partner-portal/activities').send({ data: nouvelleActivite() });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Soirée quiz', price: 12.5, maxParticipants: 6, bookingsCount: 0 });

    const publique = await api().get(`/api/activities/${res.body.data.documentId}?populate=partner`);
    expect(publique.status).toBe(200);
    expect(publique.body.data.partner.documentId).toBe(partner.documentId);
  });

  it('ignore les champs que le partenaire ne doit pas fixer', async () => {
    const partner = await loggedPartner();
    const autre = await createPartner();

    const res = await asPartner(partner)
      .post('/api/partner-portal/activities')
      .send({ data: nouvelleActivite({ partner: autre.documentId, usersNotes: 5 }) });

    const enBase = await strapi.documents('api::activity.activity').findOne({
      documentId: res.body.data.documentId,
      populate: ['partner'],
    });
    expect(enBase.partner.documentId).toBe(partner.documentId);
    expect(enBase.usersNotes).toBeNull();
  });

  it.each([
    [{ title: '' }, 'titre manquant'],
    [{ startDate: 'demain' }, 'date invalide'],
    [{ endDate: '2026-11-01T10:00:00.000Z' }, 'fin avant le début'],
    [{ minParticipants: 8 }, 'minimum supérieur au maximum'],
    [{ price: -3 }, 'prix négatif'],
    [{ maxParticipants: 2.5 }, 'nombre non entier'],
  ])('refuse une activité invalide (%#, %s)', async (overrides) => {
    const partner = await loggedPartner();
    const res = await asPartner(partner).post('/api/partner-portal/activities').send({ data: nouvelleActivite(overrides) });
    expect(res.status).toBe(400);
  });

  it('ne liste que les activités du partenaire', async () => {
    const alice = await loggedPartner();
    const bob = await loggedPartner();
    await asPartner(alice).post('/api/partner-portal/activities').send({ data: nouvelleActivite({ title: 'A' }) });
    await asPartner(bob).post('/api/partner-portal/activities').send({ data: nouvelleActivite({ title: 'B' }) });

    const res = await asPartner(alice).get('/api/partner-portal/activities');

    expect(res.body.data.map((activite) => activite.title)).toEqual(['A']);
  });

  it('modifie une activité, en vérifiant les champs croisés avec les valeurs existantes', async () => {
    const partner = await loggedPartner();
    const { body } = await asPartner(partner).post('/api/partner-portal/activities').send({ data: nouvelleActivite() });
    const url = `/api/partner-portal/activities/${body.data.documentId}`;

    const ok = await asPartner(partner).put(url).send({ data: { title: 'Quiz musical', price: 15 } });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ title: 'Quiz musical', price: 15, location: '12 rue de la Paix, Nantes' });

    const ko = await asPartner(partner).put(url).send({ data: { minParticipants: 10 } });
    expect(ko.status).toBe(400);

    const publique = await api().get(`/api/activities/${body.data.documentId}`);
    expect(publique.body.data.title).toBe('Quiz musical');
  });

  it('interdit de lire, modifier ou supprimer l’activité d’un autre partenaire', async () => {
    const alice = await loggedPartner();
    const bob = await loggedPartner();
    const { body } = await asPartner(alice).post('/api/partner-portal/activities').send({ data: nouvelleActivite() });
    const url = `/api/partner-portal/activities/${body.data.documentId}`;

    expect((await asPartner(bob).get(url)).status).toBe(404);
    expect((await asPartner(bob).put(url).send({ data: { title: 'Piraté' } })).status).toBe(404);
    expect((await asPartner(bob).delete(url)).status).toBe(404);
    expect((await asPartner(alice).get(url)).body.data.title).toBe('Soirée quiz');
  });

  it('supprime une activité sans réservation', async () => {
    const partner = await loggedPartner();
    const { body } = await asPartner(partner).post('/api/partner-portal/activities').send({ data: nouvelleActivite() });

    const res = await asPartner(partner).delete(`/api/partner-portal/activities/${body.data.documentId}`);

    expect(res.status).toBe(204);
    expect((await api().get(`/api/activities/${body.data.documentId}`)).status).toBe(404);
  });

  it('refuse de supprimer une activité réservée, et compte ses réservations', async () => {
    const partner = await loggedPartner();
    const user = await createUser();
    const { body } = await asPartner(partner).post('/api/partner-portal/activities').send({ data: nouvelleActivite() });
    await api()
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user.jwt}`)
      .send({ data: { activity: body.data.documentId } });
    const url = `/api/partner-portal/activities/${body.data.documentId}`;

    expect((await asPartner(partner).get(url)).body.data.bookingsCount).toBe(1);
    expect((await asPartner(partner).delete(url)).status).toBe(400);
  });
});
