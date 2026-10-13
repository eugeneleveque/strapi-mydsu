'use strict';

/**
 * Notifications push (Web Push) : abonnement des navigateurs, envoi, ménage
 * des abonnements expirés et déclenchement sur un message ou un match.
 * Aucun appel réseau : l'envoi vers les services de push est remplacé.
 */

const crypto = require('crypto');
const webpush = require('web-push');
const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createUser, createMatch, like, sendMessage, unique } = require('../helpers/factories');

jest.setTimeout(120000);

const PUSH_UID = 'api::push-subscription.push-subscription';
const pushService = () => strapi.service(PUSH_UID);
const storedSubscriptions = (where = {}) => strapi.db.query(PUSH_UID).findMany({ where, populate: { user: true } });

const vapidKeys = webpush.generateVAPIDKeys();

const enablePush = () => {
  process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:test@bondiz.test';
};

const disablePush = () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
};

/** Un abonnement tel que le navigateur l'envoie (PushSubscription.toJSON()). */
const browserSubscription = (overrides = {}) => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${unique('device')}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url'),
    },
    ...overrides,
  };
};

const subscribe = (user, subscription = browserSubscription()) =>
  as(user).post('/api/push/subscriptions').send(subscription);

/** Les envois partent en arrière-plan : on attend qu'ils aient eu lieu. */
const waitFor = async (assertion, timeout = 3000) => {
  const start = Date.now();
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
};

const pushError = (statusCode) => Object.assign(new Error(`push ${statusCode}`), { statusCode });

let deliver;

beforeAll(() => setupStrapi('push'));
afterAll(() => stopStrapi());

beforeEach(async () => {
  await resetData();
  enablePush();
  deliver = jest.spyOn(pushService(), 'deliver').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  disablePush();
});

describe('Clé publique', () => {
  it('renvoie la clé VAPID à un utilisateur connecté', async () => {
    const alice = await createUser();

    const res = await as(alice).get('/api/push/public-key');

    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toBe(vapidKeys.publicKey);
  });

  it('renvoie null quand le serveur n’est pas configuré', async () => {
    disablePush();
    const alice = await createUser();

    const res = await as(alice).get('/api/push/public-key');

    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toBeNull();
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await api().get('/api/push/public-key');

    expect([401, 403]).toContain(res.status);
  });
});

describe('Abonnement', () => {
  it('enregistre l’abonnement pour l’utilisateur connecté', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const subscription = browserSubscription();

    const res = await as(alice).post('/api/push/subscriptions').send({ ...subscription, user: bob.id });

    expect(res.status).toBe(201);
    const [stored] = await storedSubscriptions();
    expect(stored.endpoint).toBe(subscription.endpoint);
    expect(stored.user.id).toBe(alice.id);
  });

  it('ne renvoie jamais les clés de l’abonnement', async () => {
    const alice = await createUser();

    const res = await subscribe(alice);

    expect(res.body.data).toEqual({ subscribed: true });
  });

  it('ne crée pas de doublon et transfère l’appareil au dernier compte connecté', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const subscription = browserSubscription();

    await subscribe(alice, subscription);
    await subscribe(alice, subscription);
    await subscribe(bob, subscription);

    const stored = await storedSubscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0].user.id).toBe(bob.id);
  });

  it.each([
    ['une URL hors des services de push', 'https://evil.example/collect'],
    ['une adresse interne', 'https://localhost:1337/admin'],
    ['un domaine qui imite un service de push', 'https://fcm.googleapis.com.evil.example/x'],
    ['une URL sans HTTPS', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['une valeur qui n’est pas une URL', 'pas-une-url'],
  ])('refuse %s', async (_label, endpoint) => {
    const alice = await createUser();

    const res = await subscribe(alice, browserSubscription({ endpoint }));

    expect(res.status).toBe(400);
    expect(await storedSubscriptions()).toHaveLength(0);
  });

  it('refuse un abonnement sans clés', async () => {
    const alice = await createUser();

    const res = await subscribe(alice, { endpoint: browserSubscription().endpoint });

    expect(res.status).toBe(400);
  });

  it('répond 503 quand le serveur n’est pas configuré', async () => {
    disablePush();
    const alice = await createUser();

    const res = await subscribe(alice);

    expect(res.status).toBe(503);
    expect(await storedSubscriptions()).toHaveLength(0);
  });

  it('refuse un visiteur non connecté', async () => {
    const res = await api().post('/api/push/subscriptions').send(browserSubscription());

    expect([401, 403]).toContain(res.status);
  });
});

describe('Désabonnement', () => {
  it('supprime l’abonnement de l’appareil', async () => {
    const alice = await createUser();
    const [phone, laptop] = [browserSubscription(), browserSubscription()];
    await subscribe(alice, phone);
    await subscribe(alice, laptop);

    const res = await as(alice).post('/api/push/subscriptions/unsubscribe').send({ endpoint: phone.endpoint });

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(1);
    const stored = await storedSubscriptions();
    expect(stored.map((subscription) => subscription.endpoint)).toEqual([laptop.endpoint]);
  });

  it('ne supprime pas l’abonnement de quelqu’un d’autre', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const subscription = browserSubscription();
    await subscribe(alice, subscription);

    const res = await as(bob).post('/api/push/subscriptions/unsubscribe').send({ endpoint: subscription.endpoint });

    expect(res.body.data.removed).toBe(0);
    expect(await storedSubscriptions()).toHaveLength(1);
  });

  it('exige l’endpoint', async () => {
    const alice = await createUser();

    const res = await as(alice).post('/api/push/subscriptions/unsubscribe').send({});

    expect(res.status).toBe(400);
  });

  it('supprime les abonnements avec le compte', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    await subscribe(alice);
    await subscribe(bob);

    const res = await as(alice).delete(`/api/users/${alice.id}`);

    expect(res.status).toBe(200);
    const stored = await storedSubscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0].user.id).toBe(bob.id);
  });
});

describe('Envoi', () => {
  it('notifie tous les appareils de l’utilisateur, et seulement les siens', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [phone, laptop] = [browserSubscription(), browserSubscription()];
    await subscribe(alice, phone);
    await subscribe(alice, laptop);
    await subscribe(bob);

    const result = await pushService().notifyUser(alice.id, { title: 'Titre', body: 'Corps', url: '/home' });

    expect(result).toEqual({ sent: 2, removed: 0 });
    const endpoints = deliver.mock.calls.map(([subscription]) => subscription.endpoint).sort();
    expect(endpoints).toEqual([phone.endpoint, laptop.endpoint].sort());
    expect(deliver.mock.calls[0][1]).toEqual({ title: 'Titre', body: 'Corps', url: '/home' });
  });

  it.each([404, 410])('supprime un abonnement que le service de push déclare expiré (%i)', async (statusCode) => {
    const alice = await createUser();
    await subscribe(alice);
    deliver.mockRejectedValue(pushError(statusCode));

    const result = await pushService().notifyUser(alice.id, { title: 'Titre', body: 'Corps' });

    expect(result).toEqual({ sent: 0, removed: 1 });
    expect(await storedSubscriptions()).toHaveLength(0);
  });

  it('garde l’abonnement après une erreur passagère', async () => {
    const alice = await createUser();
    await subscribe(alice);
    deliver.mockRejectedValue(pushError(500));

    const result = await pushService().notifyUser(alice.id, { title: 'Titre', body: 'Corps' });

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(await storedSubscriptions()).toHaveLength(1);
  });

  it('coupe un texte trop long', async () => {
    const alice = await createUser();
    await subscribe(alice);

    await pushService().notifyUser(alice.id, { title: 'Titre', body: 'x'.repeat(500) });

    const { body } = deliver.mock.calls[0][1];
    expect(body).toHaveLength(140);
    expect(body.endsWith('…')).toBe(true);
  });

  it('n’envoie rien quand le serveur n’est pas configuré', async () => {
    const alice = await createUser();
    await subscribe(alice);
    disablePush();

    const result = await pushService().notifyUser(alice.id, { title: 'Titre', body: 'Corps' });

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('signe et chiffre la notification avec les clés VAPID', async () => {
    const alice = await createUser();
    const subscription = browserSubscription();
    await subscribe(alice, subscription);
    deliver.mockRestore();
    const sendNotification = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });

    const result = await pushService().notifyUser(alice.id, { title: 'Titre', body: 'Corps' });

    expect(result.sent).toBe(1);
    const [target, payload, options] = sendNotification.mock.calls[0];
    expect(target).toEqual(subscription);
    expect(JSON.parse(payload)).toEqual({ title: 'Titre', body: 'Corps' });
    expect(options.vapidDetails.publicKey).toBe(vapidKeys.publicKey);
    expect(options.TTL).toBeGreaterThan(0);
  });
});

describe('Déclencheurs', () => {
  it('notifie le destinataire d’un message, pas l’expéditeur', async () => {
    const [alice, bob] = [await createUser({ username: unique('alice') }), await createUser()];
    const match = await createMatch(alice, bob);
    const bobDevice = browserSubscription();
    await subscribe(alice);
    await subscribe(bob, bobDevice);
    deliver.mockClear();

    const res = await sendMessage(alice, match.documentId, 'Salut Bob !');

    expect(res.status).toBe(201);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    const [subscription, payload] = deliver.mock.calls[0];
    expect(subscription.endpoint).toBe(bobDevice.endpoint);
    expect(payload).toEqual({
      title: alice.username,
      body: 'Salut Bob !',
      url: `/chat/${match.documentId}`,
      tag: `chat-${match.documentId}`,
    });
  });

  it('envoie le message même si la notification échoue', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const match = await createMatch(alice, bob);
    await subscribe(bob);
    deliver.mockClear();
    deliver.mockRejectedValue(pushError(500));

    const res = await sendMessage(alice, match.documentId, 'Toujours là ?');

    expect(res.status).toBe(201);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
  });

  it('notifie d’un match la personne qui avait liké en premier', async () => {
    const [alice, bob] = [await createUser(), await createUser({ username: unique('bob') })];
    const aliceDevice = browserSubscription();
    await subscribe(alice, aliceDevice);
    await subscribe(bob);

    await like(alice, bob.id);
    expect(deliver).not.toHaveBeenCalled();

    const res = await like(bob, alice.id);

    expect(res.body.meta.matched).toBe(true);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    const [subscription, payload] = deliver.mock.calls[0];
    expect(subscription.endpoint).toBe(aliceDevice.endpoint);
    expect(payload.title).toBe('Nouveau match !');
    expect(payload.body).toContain(bob.username);
    expect(payload.url).toBe(`/chat/${res.body.meta.match.documentId}`);
  });

  it('ne renvoie pas de notification pour un match déjà existant', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    await subscribe(alice);
    await createMatch(alice, bob);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    deliver.mockClear();

    await like(bob, alice.id);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(deliver).not.toHaveBeenCalled();
  });
});
