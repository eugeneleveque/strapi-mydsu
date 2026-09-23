'use strict';

/**
 * Likes et matchs : c'est le serveur qui décide de l'auteur d'un like
 * et qui crée le match quand il est réciproque.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createUser, createMatch, like } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('like-match'));
beforeEach(() => resetData());
afterAll(() => stopStrapi());

describe('Envoi d’un like', () => {
  it('crée un like en attente et ignore le fromUser envoyé par le client', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];

    const res = await as(alice)
      .post('/api/likes')
      .send({ data: { fromUser: carol.id, toUser: bob.id, state: 'accepted' } });

    expect(res.status).toBe(201);
    expect(res.body.meta.matched).toBe(false);
    expect(res.body.data.state).toBe('pending');

    const enBase = await strapi.db.query('api::like.like').findOne({
      where: { documentId: res.body.data.documentId },
      populate: { fromUser: true },
    });
    expect(enBase.fromUser.id).toBe(alice.id);
  });

  it('refuse de se liker soi-même', async () => {
    const alice = await createUser();
    const res = await like(alice, alice.id);

    expect(res.status).toBe(400);
  });

  it('refuse un like anonyme', async () => {
    const alice = await createUser();
    const res = await api().post('/api/likes').send({ data: { toUser: alice.id } });

    expect([401, 403]).toContain(res.status);
  });

  it('refuse un like vers un utilisateur inexistant', async () => {
    const alice = await createUser();
    const res = await like(alice, 999999);

    expect(res.status).toBe(404);
  });

  it('est idempotent : liker deux fois ne crée qu’un like', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    await like(alice, bob.id);
    const res = await like(alice, bob.id);
    expect(res.status).toBe(201);

    const count = await strapi.db.query('api::like.like').count({
      where: { fromUser: { id: alice.id }, toUser: { id: bob.id }, publishedAt: { $notNull: true } },
    });
    expect(count).toBe(1);
  });
});

describe('Création du match', () => {
  it('crée le match quand le like est réciproque et l’annonce dans meta', async () => {
    const [alice, bob] = [await createUser(), await createUser()];

    await like(alice, bob.id);
    const res = await like(bob, alice.id);

    expect(res.status).toBe(201);
    expect(res.body.meta.matched).toBe(true);
    expect(res.body.meta.match.documentId).toEqual(expect.any(String));
    expect(res.body.data.state).toBe('accepted');
  });

  it('passe les deux likes à "accepted"', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    await createMatch(alice, bob);

    const likes = await strapi.db.query('api::like.like').findMany({
      where: {
        publishedAt: { $notNull: true },
        $or: [
          { fromUser: { id: alice.id }, toUser: { id: bob.id } },
          { fromUser: { id: bob.id }, toUser: { id: alice.id } },
        ],
      },
    });

    expect(likes).toHaveLength(2);
    expect(likes.every((item) => item.state === 'accepted')).toBe(true);
  });

  it('crée le match publié, donc visible par l’API', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    await createMatch(alice, bob);

    const res = await as(alice).get('/api/matches');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('ne crée qu’un seul match, quel que soit l’ordre des likes', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    await createMatch(alice, bob);
    await like(alice, bob.id);
    await like(bob, alice.id);

    const count = await strapi.db.query('api::match.match').count({
      where: { publishedAt: { $notNull: true } },
    });
    expect(count).toBe(1);
  });
});

describe('Cloisonnement des likes et des matchs', () => {
  it('ne montre que ses propres likes', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
    await like(alice, bob.id);

    expect((await as(carol).get('/api/likes')).body.data).toHaveLength(0);

    const vusParBob = await as(bob).get('/api/likes?populate=*');
    expect(vusParBob.body.data).toHaveLength(1);
    expect(vusParBob.body.data[0].fromUser.id).toBe(alice.id);
  });

  it('ne montre pas les matchs des autres', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
    const match = await createMatch(alice, bob);

    expect((await as(carol).get('/api/matches')).body.data).toHaveLength(0);
    expect((await as(carol).get(`/api/matches/${match.documentId}`)).status).toBe(404);
  });

  it('interdit la création manuelle d’un match', async () => {
    const [alice, carol] = [await createUser(), await createUser()];
    const res = await as(alice).post('/api/matches').send({ data: { user1: alice.id, user2: carol.id } });

    expect(res.status).not.toBe(201);
  });

  it('laisse un participant supprimer le match (unmatch), mais pas un tiers', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
    const match = await createMatch(alice, bob);

    expect((await as(carol).delete(`/api/matches/${match.documentId}`)).status).toBe(404);
    expect([200, 204]).toContain((await as(bob).delete(`/api/matches/${match.documentId}`)).status);
    expect((await as(alice).get('/api/matches')).body.data).toHaveLength(0);
  });
});
