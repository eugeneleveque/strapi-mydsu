'use strict';

/**
 * Favoris : gardés côté serveur, par utilisateur, désignés par le
 * documentId de l'activité.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createActivity, createUser } = require('../helpers/factories');

jest.setTimeout(120000);

let yoga;
let bowling;

beforeAll(async () => {
  await setupStrapi('favorite');
  yoga = await createActivity({ title: 'Yoga' });
  bowling = await createActivity({ title: 'Bowling' });
});
afterAll(() => stopStrapi());
beforeEach(() => resetData());

describe('Favoris', () => {
  it('ajoute, liste et retire des favoris', async () => {
    const user = await createUser();

    expect((await as(user).get('/api/favorites')).body).toEqual({ data: [] });

    await as(user).put(`/api/favorites/${yoga.documentId}`);
    const added = await as(user).put(`/api/favorites/${bowling.documentId}`);
    expect(added.status).toBe(200);
    expect(added.body.data.sort()).toEqual([yoga.documentId, bowling.documentId].sort());

    // Ajouter deux fois ne crée pas de doublon.
    await as(user).put(`/api/favorites/${yoga.documentId}`);
    expect((await as(user).get('/api/favorites')).body.data).toHaveLength(2);

    const removed = await as(user).delete(`/api/favorites/${yoga.documentId}`);
    expect(removed.body.data).toEqual([bowling.documentId]);
  });

  it('sépare les favoris de chaque utilisateur', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    await as(alice).put(`/api/favorites/${yoga.documentId}`);

    expect((await as(bob).get('/api/favorites')).body.data).toEqual([]);
    await as(bob).delete(`/api/favorites/${yoga.documentId}`);
    expect((await as(alice).get('/api/favorites')).body.data).toEqual([yoga.documentId]);
  });

  it('refuse une activité inconnue', async () => {
    const user = await createUser();
    const res = await as(user).put('/api/favorites/inexistante');
    expect(res.status).toBe(404);
  });

  it('masque les activités qui ne sont plus publiées', async () => {
    const user = await createUser();
    const ephemere = await createActivity({ title: 'Éphémère' });
    await as(user).put(`/api/favorites/${ephemere.documentId}`);

    await strapi.documents('api::activity.activity').unpublish({ documentId: ephemere.documentId });

    expect((await as(user).get('/api/favorites')).body.data).toEqual([]);
  });

  it('demande d’être connecté', async () => {
    expect((await api().get('/api/favorites')).status).toBe(403);
  });
});
