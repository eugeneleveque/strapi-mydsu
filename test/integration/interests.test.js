'use strict';

/**
 * Identité (prénom, nom) et catalogue des centres d'intérêt rangés
 * par catégorie.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createUser } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('interests'));
afterAll(() => stopStrapi());

const USER_UID = 'plugin::users-permissions.user';
const INTEREST_UID = 'api::interest.interest';
const CATEGORY_UID = 'api::interest-category.interest-category';

describe('Catalogue amorcé au démarrage', () => {
  it('crée les catégories et leurs centres d’intérêt', async () => {
    const categories = await strapi.db.query(CATEGORY_UID).findMany({ populate: { interests: true } });

    expect(categories.length).toBeGreaterThanOrEqual(4);

    const sport = categories.find((categorie) => categorie.slug === 'sport-bien-etre');
    expect(sport.icon).toBe('fitness-outline');
    expect(sport.interests.map((interet) => interet.name)).toContain('Badminton');
  });

  it('rattache chaque centre d’intérêt à une seule catégorie', async () => {
    const badminton = await strapi.db.query(INTEREST_UID).findOne({
      where: { slug: 'badminton' },
      populate: { category: true },
    });

    expect(badminton.category.name).toBe('Sport & Bien-être');
  });

  it('expose le catalogue sans authentification, pour le questionnaire', async () => {
    const res = await api().get('/api/interest-categories?populate=interests&sort=sortOrder');

    expect(res.status).toBe(200);
    expect(res.body.data[0].interests.length).toBeGreaterThan(0);
  });

  it('interdit de modifier le catalogue par l’API', async () => {
    const alice = await createUser();
    const res = await as(alice).post('/api/interests').send({ data: { name: 'Pétanque', slug: 'petanque' } });

    expect(res.status).not.toBe(201);
  });
});

describe('Prénom et nom', () => {
  it('enregistre les deux et n’expose que le prénom aux autres', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    const miseAJour = await as(alice)
      .put(`/api/users/${alice.id}`)
      .send({ firstName: 'Alice', lastName: 'Durand' });
    expect(miseAJour.status).toBe(200);

    const enBase = await strapi.db.query(USER_UID).findOne({ where: { id: alice.id } });
    expect(enBase.firstName).toBe('Alice');
    expect(enBase.lastName).toBe('Durand');

    // Pour soi : tout ; pour les autres : le prénom seulement.
    const moi = await as(alice).get('/api/users/me');
    expect(moi.body.firstName).toBe('Alice');

    const vuParBob = (await as(bob).get('/api/users')).body.find((profil) => profil.id === alice.id);
    expect(vuParBob.firstName).toBe('Alice');
    expect(vuParBob).not.toHaveProperty('lastName');
  });

  it('ne laisse jamais sortir le nom de famille, même sur son propre profil', async () => {
    const alice = await createUser();
    await as(alice).put(`/api/users/${alice.id}`).send({ firstName: 'Alice', lastName: 'Durand' });

    const moi = await as(alice).get('/api/users/me');

    expect(moi.body).not.toHaveProperty('lastName');
  });
});

describe('Centres d’intérêt d’un profil', () => {
  it('se rattachent au catalogue et ressortent avec leur catégorie', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const badminton = await strapi.db.query(INTEREST_UID).findOne({ where: { slug: 'badminton' } });

    await as(alice).put(`/api/users/${alice.id}`).send({ interestTags: [badminton.id] });

    const res = await as(bob).get('/api/users?populate[interestTags][populate]=category');
    const profil = res.body.find((utilisateur) => utilisateur.id === alice.id);

    expect(profil.interestTags[0].name).toBe('Badminton');
    expect(profil.interestTags[0].category.name).toBe('Sport & Bien-être');
  });
});

describe('Filtres de /discover', () => {
  beforeEach(() => resetData());

  it('filtre par catégorie', async () => {
    const moi = await createUser();
    const sportif = await createUser();
    const artiste = await createUser();

    const badminton = await strapi.db.query(INTEREST_UID).findOne({ where: { slug: 'badminton' } });
    const dessin = await strapi.db.query(INTEREST_UID).findOne({ where: { slug: 'dessin' } });
    await strapi.db.query(USER_UID).update({ where: { id: sportif.id }, data: { interestTags: [badminton.id] } });
    await strapi.db.query(USER_UID).update({ where: { id: artiste.id }, data: { interestTags: [dessin.id] } });

    const res = await as(moi).get('/api/discover?category=sport-bien-etre');

    expect(res.body.data.map((profil) => profil.id)).toEqual([sportif.id]);
  });

  it('filtre par centre d’intérêt du catalogue', async () => {
    const moi = await createUser();
    const sportif = await createUser();
    await createUser();

    const badminton = await strapi.db.query(INTEREST_UID).findOne({ where: { slug: 'badminton' } });
    await strapi.db.query(USER_UID).update({ where: { id: sportif.id }, data: { interestTags: [badminton.id] } });

    const res = await as(moi).get('/api/discover?interests=Badminton');

    expect(res.body.data.map((profil) => profil.id)).toEqual([sportif.id]);
  });

  it('n’expose plus l’ancien champ texte', async () => {
    const [moi, autre] = [await createUser(), await createUser()];

    const res = await as(moi).get('/api/discover');
    const profil = res.body.data.find((candidat) => candidat.id === autre.id);

    expect(profil).not.toHaveProperty('interests');
  });
});
