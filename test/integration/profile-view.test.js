'use strict';

/**
 * Consultations de profils : on enregistre qui a vu qui, sans que cela
 * retire le profil de /discover.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createUser } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('profile-view'));
beforeEach(() => resetData());
afterAll(() => stopStrapi());

const VIEW_UID = 'api::profile-view.profile-view';

describe('Enregistrement d’une consultation', () => {
  it('enregistre le profil vu, avec le spectateur déduit du token', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];

    const res = await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, viewer: carol.id } });

    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe('seen');

    const enBase = await strapi.db.query(VIEW_UID).findOne({
      where: { viewed: { id: bob.id } },
      populate: { viewer: true, viewed: true },
    });
    expect(enBase.viewer.id).toBe(alice.id);
    expect(enBase.viewCount).toBe(1);
  });

  it('accepte l’action "skipped"', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    const res = await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, action: 'skipped' } });

    expect(res.body.data.action).toBe('skipped');
  });

  it('ne crée qu’une ligne par couple et compte les passages', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id } });
    const res = await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id } });

    expect(res.body.data.viewCount).toBe(2);
    expect(await strapi.db.query(VIEW_UID).count({ where: { viewer: { id: alice.id } } })).toBe(1);
  });

  it('garde "skipped" si le profil est revu ensuite', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, action: 'skipped' } });
    const res = await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, action: 'seen' } });

    expect(res.body.data.action).toBe('skipped');
  });

  it('refuse de se voir soi-même, un inconnu, ou une action inventée', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    expect((await as(alice).post('/api/profile-views').send({ data: { viewed: alice.id } })).status).toBe(400);
    expect((await as(alice).post('/api/profile-views').send({ data: { viewed: 999999 } })).status).toBe(404);
    expect(
      (await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, action: 'aime_un_peu' } })).status
    ).toBe(400);
  });

  it('exige une authentification', async () => {
    const bob = await createUser();
    const res = await api().post('/api/profile-views').send({ data: { viewed: bob.id } });

    expect([401, 403]).toContain(res.status);
  });
});

describe('Enregistrement groupé', () => {
  it('enregistre toute une page de profils en un appel', async () => {
    const alice = await createUser();
    const vus = [await createUser(), await createUser(), await createUser()];

    const res = await as(alice)
      .post('/api/profile-views')
      .send({ data: { views: vus.map((u) => ({ viewed: u.id, action: 'seen' })) } });

    expect(res.status).toBe(201);
    expect(res.body.data.recorded).toBe(3);
    expect(res.body.meta.failures).toHaveLength(0);
  });

  it('signale les entrées invalides sans perdre les autres', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    const res = await as(alice)
      .post('/api/profile-views')
      .send({ data: { views: [{ viewed: bob.id }, { viewed: 999999 }] } });

    expect(res.body.data.recorded).toBe(1);
    expect(res.body.meta.failures).toHaveLength(1);
  });

  it('refuse un lot trop gros', async () => {
    const alice = await createUser();
    const views = Array.from({ length: 101 }, (_, i) => ({ viewed: i + 1000 }));

    const res = await as(alice).post('/api/profile-views').send({ data: { views } });

    expect(res.status).toBe(400);
  });
});

describe('Lecture', () => {
  it('ne montre que ses propres consultations', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
    await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id } });

    expect((await as(alice).get('/api/profile-views')).body.data).toHaveLength(1);
    expect((await as(carol).get('/api/profile-views')).body.data).toHaveLength(0);
    // Même le profil consulté ne voit pas qu'il a été vu.
    expect((await as(bob).get('/api/profile-views')).body.data).toHaveLength(0);
  });
});

describe('Effet sur /discover', () => {
  it('continue de proposer un profil déjà vu ou passé', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    await as(alice).post('/api/profile-views').send({ data: { viewed: bob.id, action: 'skipped' } });

    const res = await as(alice).get('/api/discover');
    expect(res.body.data.map((profil) => profil.id)).toContain(bob.id);
  });
});
