'use strict';

/**
 * Comptes utilisateurs : inscription, connexion, et cloisonnement des profils.
 */

const { setupStrapi, stopStrapi } = require('../helpers/strapi');
const { api, as, createUser, unique } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('users'));
afterAll(() => stopStrapi());

describe('Inscription et connexion', () => {
  it('inscrit un utilisateur et renvoie un JWT', async () => {
    const username = unique('newbie');
    const res = await api()
      .post('/api/auth/local/register')
      .send({ username, email: `${username}@test.fr`, password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.jwt).toEqual(expect.any(String));
    expect(res.body.user.username).toBe(username);
  });

  it('refuse un mot de passe trop court', async () => {
    const username = unique('short');
    const res = await api()
      .post('/api/auth/local/register')
      .send({ username, email: `${username}@test.fr`, password: '123' });

    expect(res.status).toBe(400);
  });

  it('connecte avec les bons identifiants et refuse les mauvais', async () => {
    const user = await createUser();

    const ok = await api().post('/api/auth/local').send({ identifier: user.email, password: 'secret123' });
    expect(ok.status).toBe(200);
    expect(ok.body.jwt).toEqual(expect.any(String));

    const ko = await api().post('/api/auth/local').send({ identifier: user.email, password: 'mauvais' });
    expect(ko.status).toBe(400);
  });
});

describe('Lecture des profils', () => {
  it('/users/me renvoie ses propres données complètes', async () => {
    const user = await createUser();
    const res = await as(user).get('/api/users/me');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  it('masque les données sensibles des autres profils', async () => {
    const [alice, bob] = [await createUser(), await createUser({ latitude: 47.2, longitude: -1.5 })];

    const res = await as(alice).get('/api/users?populate=*');
    expect(res.status).toBe(200);

    const bobSeenByAlice = res.body.find((user) => user.id === bob.id);
    expect(bobSeenByAlice.username).toBe(bob.username);
    expect(bobSeenByAlice).not.toHaveProperty('email');
    expect(bobSeenByAlice).not.toHaveProperty('latitude');
    expect(bobSeenByAlice).not.toHaveProperty('sentMessages');
    expect(bobSeenByAlice).not.toHaveProperty('role');
  });

  it('ignore un filtre sur un champ privé, au lieu de le laisser fuiter', async () => {
    const alice = await createUser();
    const cible = await createUser();

    const res = await as(alice).get(`/api/users?filters[email][$contains]=${cible.email}`);

    expect(res.status).toBe(200);
    // Le filtre est retiré : on obtient la liste complète, pas le seul compte visé.
    expect(res.body.length).toBeGreaterThan(1);
  });

  it('interdit la liste des utilisateurs sans authentification', async () => {
    const res = await api().get('/api/users');
    expect(res.status).toBe(403);
  });

  it('ne liste pas les comptes bloqués', async () => {
    const alice = await createUser();
    const banni = await createUser({ blocked: true });

    const res = await as(alice).get('/api/users');

    expect(res.body.map((user) => user.id)).not.toContain(banni.id);
  });
});

describe('Modification et suppression de compte', () => {
  it('modifie son propre profil', async () => {
    const user = await createUser();
    const res = await as(user).put(`/api/users/${user.id}`).send({ bio: 'Salut', city: 'Nantes' });

    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('Salut');
    expect(res.body.city).toBe('Nantes');
  });

  it('refuse de modifier le profil d’un autre', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const res = await as(alice).put(`/api/users/${bob.id}`).send({ bio: 'piraté' });

    expect(res.status).toBe(403);

    const bobEnBase = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: bob.id } });
    expect(bobEnBase.bio).toBeNull();
  });

  it('ignore les champs protégés (rôle, confirmation, blocage)', async () => {
    const user = await createUser();
    const avant = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      populate: { role: true },
    });

    const res = await as(user).put(`/api/users/${user.id}`).send({ bio: 'ok', blocked: true, confirmed: false });
    expect(res.status).toBe(200);

    const apres = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      populate: { role: true },
    });
    expect(apres.blocked).toBe(false);
    expect(apres.role.id).toBe(avant.role.id);
  });

  it('refuse de supprimer le compte d’un autre', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const res = await as(alice).delete(`/api/users/${bob.id}`);

    expect(res.status).toBe(403);
  });
});
