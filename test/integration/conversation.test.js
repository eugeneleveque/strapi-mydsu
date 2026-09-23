'use strict';

/**
 * Chat : réservé aux matchs, cloisonné, et archivage (suppression douce)
 * à l'unmatch ou quand l'auteur supprime son message.
 */

const { setupStrapi, stopStrapi } = require('../helpers/strapi');
const { api, as, createUser, createMatch, sendMessage } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('conversation'));
afterAll(() => stopStrapi());

/** Deux utilisateurs matchés, prêts à discuter. */
async function matchedPair() {
  const [alice, bob] = [await createUser(), await createUser()];
  const match = await createMatch(alice, bob);
  return { alice, bob, match };
}

describe('Envoi de messages', () => {
  it('envoie un message à son match et force l’expéditeur', async () => {
    const { alice, bob, match } = await matchedPair();

    const res = await as(alice)
      .post(`/api/conversations/${match.documentId}/messages`)
      .send({ data: { content: 'Salut !', sender: bob.id } });

    expect(res.status).toBe(201);
    expect(res.body.data.isMine).toBe(true);

    const enBase = await strapi.db.query('api::message.message').findOne({
      where: { documentId: res.body.data.documentId },
      populate: { sender: true, recipient: true },
    });
    expect(enBase.sender.id).toBe(alice.id);
    expect(enBase.recipient.id).toBe(bob.id);
  });

  it('refuse d’écrire à quelqu’un qui n’est pas un match', async () => {
    const [alice, carol] = [await createUser(), await createUser()];

    const res = await as(alice).post('/api/messages').send({ data: { content: 'Coucou', recipient: carol.id } });

    expect(res.status).toBe(403);
  });

  it('refuse un message vide ou trop long', async () => {
    const { alice, match } = await matchedPair();

    expect((await sendMessage(alice, match.documentId, '   ')).status).toBe(400);
    expect((await sendMessage(alice, match.documentId, 'x'.repeat(2500))).status).toBe(400);
  });

  it('refuse qu’un tiers écrive dans la conversation', async () => {
    const { match } = await matchedPair();
    const carol = await createUser();

    const res = await sendMessage(carol, match.documentId, 'coucou');

    expect(res.status).toBe(403);
  });
});

describe('Liste des conversations', () => {
  it('renvoie le profil public, le dernier message et les non-lus', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'Premier');
    await sendMessage(alice, match.documentId, 'Dernier');

    const res = await as(bob).get('/api/conversations');

    expect(res.status).toBe(200);
    const conversation = res.body.data.find((item) => item.otherUser.id === alice.id);
    expect(conversation.otherUser.username).toBe(alice.username);
    expect(conversation.otherUser).not.toHaveProperty('email');
    expect(conversation.lastMessage.content).toBe('Dernier');
    expect(conversation.lastMessage.isMine).toBe(false);
    expect(conversation.unreadCount).toBe(2);
    expect(res.body.meta.unreadTotal).toBeGreaterThanOrEqual(2);
  });

  it('exige une authentification', async () => {
    const res = await api().get('/api/conversations');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Historique et lecture', () => {
  it('renvoie les messages dans l’ordre chronologique', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'un');
    await sendMessage(bob, match.documentId, 'deux');

    const res = await as(bob).get(`/api/conversations/${match.documentId}/messages`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((message) => message.content)).toEqual(['un', 'deux']);
    expect(res.body.data[0].isMine).toBe(false);
    expect(res.body.data[1].isMine).toBe(true);
  });

  it('accepte aussi l’identifiant numérique du match', async () => {
    const { alice, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'test');

    const res = await as(alice).get(`/api/conversations/${match.id}/messages`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('pagine en commençant par les messages les plus récents', async () => {
    const { alice, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'ancien');
    await sendMessage(alice, match.documentId, 'récent');

    const res = await as(alice).get(`/api/conversations/${match.documentId}/messages?pageSize=1`);

    expect(res.body.data.map((message) => message.content)).toEqual(['récent']);
    expect(res.body.meta.pagination.total).toBe(2);
  });

  it('ne renvoie que les nouveaux messages avec "since"', async () => {
    const { alice, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'avant');
    const repere = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendMessage(alice, match.documentId, 'après');

    const res = await as(alice).get(
      `/api/conversations/${match.documentId}/messages?since=${encodeURIComponent(repere)}`
    );

    expect(res.body.data.map((message) => message.content)).toEqual(['après']);
  });

  it('refuse un "since" qui n’est pas une date', async () => {
    const { alice, match } = await matchedPair();
    const res = await as(alice).get(`/api/conversations/${match.documentId}/messages?since=pasunedate`);

    expect(res.status).toBe(400);
  });

  it('marque toute la conversation comme lue', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'lis-moi');

    const res = await as(bob).post(`/api/conversations/${match.documentId}/read`);

    expect(res.status).toBe(200);
    expect(res.body.data.markedRead).toBe(1);

    const apres = await as(bob).get('/api/conversations');
    expect(apres.body.meta.unreadTotal).toBe(0);
  });

  it('interdit à un tiers de lire la conversation', async () => {
    const { match } = await matchedPair();
    const carol = await createUser();

    const res = await as(carol).get(`/api/conversations/${match.documentId}/messages`);

    expect(res.status).toBe(403);
  });

  it('renvoie 404 pour une conversation inexistante', async () => {
    const alice = await createUser();
    const res = await as(alice).get('/api/conversations/999999/messages');

    expect(res.status).toBe(404);
  });
});

describe('Archivage (suppression douce)', () => {
  it('archive le message supprimé par son auteur, sans l’effacer', async () => {
    const { alice, bob, match } = await matchedPair();
    const envoye = await sendMessage(alice, match.documentId, 'oups');

    expect((await as(bob).delete(`/api/messages/${envoye.body.data.documentId}`)).status).toBe(404);
    expect((await as(alice).delete(`/api/messages/${envoye.body.data.documentId}`)).status).toBe(204);

    const historique = await as(bob).get(`/api/conversations/${match.documentId}/messages`);
    expect(historique.body.data).toHaveLength(0);

    const enBase = await strapi.db.query('api::message.message').findOne({
      where: { documentId: envoye.body.data.documentId },
    });
    expect(enBase.deletedAt).toBeTruthy();
    expect(enBase.deletedReason).toBe('sender');
  });

  it('archive toute la conversation à l’unmatch, des deux côtés', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'Hello');
    await sendMessage(bob, match.documentId, 'Coucou');

    await as(alice).delete(`/api/matches/${match.documentId}`);

    expect((await as(alice).get('/api/conversations')).body.data).toHaveLength(0);
    expect(JSON.stringify((await as(alice).get('/api/messages')).body.data)).not.toContain('Hello');
    expect(JSON.stringify((await as(bob).get('/api/messages')).body.data)).not.toContain('Hello');
    expect((await as(alice).get(`/api/conversations/${match.documentId}/messages`)).status).toBe(404);
  });

  it('conserve les messages en base avec la date et le motif', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'à archiver');

    await as(alice).delete(`/api/matches/${match.documentId}`);

    const archives = await strapi.db.query('api::message.message').findMany({
      where: { content: 'à archiver' },
    });
    expect(archives).toHaveLength(1);
    expect(archives[0].deletedAt).toBeTruthy();
    expect(archives[0].deletedReason).toBe('unmatch');
  });

  it('n’archive qu’une fois, malgré le hook déclenché par version du document', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'une seule fois');

    await as(alice).delete(`/api/matches/${match.documentId}`);

    const dates = await strapi.db.query('api::message.message').findMany({
      where: { content: 'une seule fois' },
      select: ['deletedAt'],
    });
    expect(dates).toHaveLength(1);
    expect(dates[0].deletedAt).toBeTruthy();
  });

  it('interdit de réécrire après un unmatch', async () => {
    const { alice, bob, match } = await matchedPair();
    await as(alice).delete(`/api/matches/${match.documentId}`);

    const res = await as(alice).post('/api/messages').send({ data: { content: 'encore ?', recipient: bob.id } });

    expect(res.status).toBe(403);
  });

  it('n’expose jamais les champs d’archivage', async () => {
    const { alice, bob, match } = await matchedPair();
    await sendMessage(alice, match.documentId, 'visible');

    const res = await as(bob).get('/api/messages?populate=*');

    expect(JSON.stringify(res.body)).not.toContain('deletedAt');
    expect(JSON.stringify(res.body)).not.toContain('deletedReason');
  });
});

describe('Cloisonnement des messages', () => {
  it('ne montre pas les messages des autres', async () => {
    const { alice, match } = await matchedPair();
    const carol = await createUser();
    await sendMessage(alice, match.documentId, 'privé');

    const res = await as(carol).get('/api/messages');

    expect(res.body.data).toHaveLength(0);
  });

  it('laisse seulement le destinataire marquer comme lu, sans toucher au contenu', async () => {
    const { alice, bob, match } = await matchedPair();
    const envoye = await sendMessage(alice, match.documentId, 'original');
    const { documentId } = envoye.body.data;

    expect((await as(alice).put(`/api/messages/${documentId}`).send({ data: { isRead: true } })).status).toBe(404);

    const res = await as(bob).put(`/api/messages/${documentId}`).send({ data: { isRead: true, content: 'modifié' } });

    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
    expect(res.body.data.content).toBe('original');
  });
});
