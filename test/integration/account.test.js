'use strict';

/**
 * Droits RGPD : export des données, suppression du compte, purge des
 * messages archivés, et mot de passe oublié.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createActivity, createMatch, createUser, like, sendMessage, PNG_FIXTURE } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('account'));
afterAll(() => stopStrapi());
beforeEach(() => resetData());

const USER_UID = 'plugin::users-permissions.user';
const MESSAGE_UID = 'api::message.message';

describe('Export des données', () => {
  it('rassemble profil, échanges, réservations et favoris', async () => {
    const [alice, bob, carol] = await Promise.all([
      createUser({ firstName: 'Alice', lastName: 'Martin', city: 'Angers' }),
      createUser(),
      createUser(),
    ]);
    const match = await createMatch(alice, bob);
    await sendMessage(alice, match.documentId, 'Coucou Bob');
    await sendMessage(bob, match.documentId, 'Salut Alice');
    await like(carol, alice.id);
    const activity = await createActivity({ title: 'Escape game' });
    await as(alice).put(`/api/favorites/${activity.documentId}`);
    await as(alice)
      .post('/api/bookings')
      .send({ data: { activity: activity.documentId, date: '2030-01-10', time: '18:00', participants: [bob.id] } });

    const res = await as(alice).get('/api/account/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('bondiz-mes-donnees.json');
    expect(res.body.compte).toMatchObject({ identifiant: alice.username, email: alice.email, prenom: 'Alice', nom: 'Martin', ville: 'Angers' });
    expect(res.body.compte).not.toHaveProperty('password');
    expect(res.body.likesEnvoyes).toEqual([expect.objectContaining({ a: bob.username })]);
    expect(res.body.nombreDeLikesRecus).toBe(2);
    expect(res.body.connexions).toEqual([expect.objectContaining({ avec: bob.username })]);
    expect(res.body.messages.map((m) => [m.sens, m.contenu])).toEqual([
      ['envoyé', 'Coucou Bob'],
      ['reçu', 'Salut Alice'],
    ]);
    expect(res.body.reservationsOrganisees).toEqual([
      expect.objectContaining({ activite: 'Escape game', date: '2030-01-10', participants: [bob.username] }),
    ]);
    expect(res.body.activitesFavorites).toEqual([activity.documentId]);
    expect(JSON.stringify(res.body)).not.toMatch(/resetPasswordToken|"password"/);
  });

  it('est réservé à un utilisateur connecté', async () => {
    const res = await api().get('/api/account/export');
    expect(res.status).toBe(403);
  });
});

describe('Suppression du compte', () => {
  it('exige le bon mot de passe', async () => {
    const user = await createUser();

    const missing = await as(user).post('/api/account/delete').send({});
    expect(missing.status).toBe(400);
    const wrong = await as(user).post('/api/account/delete').send({ password: 'mauvais' });
    expect(wrong.status).toBe(400);

    expect(await strapi.db.query(USER_UID).count({ where: { id: user.id } })).toBe(1);
  });

  it('efface le compte et tout ce qui s’y rattache', async () => {
    const [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
    const match = await createMatch(alice, bob);
    await sendMessage(alice, match.documentId, 'Bonjour');
    await sendMessage(bob, match.documentId, 'Re');
    await like(alice, carol.id);
    const activity = await createActivity();
    await as(alice).put(`/api/favorites/${activity.documentId}`);
    await as(alice).post('/api/bookings').send({ data: { activity: activity.documentId, date: '2030-02-01', time: '10:00' } });
    const bobBooking = await as(bob)
      .post('/api/bookings')
      .send({ data: { activity: activity.documentId, date: '2030-02-02', time: '11:00', participants: [alice.id] } });
    await as(alice).post('/api/profile-views').send({ data: { views: [{ viewed: carol.id, action: 'seen' }] } });
    const upload = await as(alice)
      .post('/api/upload')
      .field('ref', USER_UID)
      .field('refId', String(alice.id))
      .field('field', 'self_image')
      .attach('files', PNG_FIXTURE, { filename: 'photo.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);

    const res = await as(alice).post('/api/account/delete').send({ password: 'secret123' });
    expect(res.status).toBe(200);

    const count = (uid, where) => strapi.db.query(uid).count({ where });
    expect(await count(USER_UID, { id: alice.id })).toBe(0);
    expect(await count(MESSAGE_UID, {})).toBe(0);
    expect(await count('api::match.match', {})).toBe(0);
    expect(await count('api::like.like', { $or: [{ fromUser: { id: alice.id } }, { toUser: { id: alice.id } }] })).toBe(0);
    expect(await count('api::like.like', {})).toBe(0);
    expect(await count('api::favorite.favorite', {})).toBe(0);
    expect(await count('api::profile-view.profile-view', {})).toBe(0);
    expect(await count('plugin::upload.file', { id: upload.body[0].id })).toBe(0);

    // La réservation de Bob reste, sans Alice.
    const kept = await strapi.db.query('api::booking.booking').findMany({ populate: ['participants', 'organizer'] });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((booking) => booking.organizer?.id === bob.id)).toBe(true);
    expect(kept.every((booking) => booking.documentId === bobBooking.body.data.documentId)).toBe(true);
    expect(kept.flatMap((booking) => booking.participants)).toEqual([]);

    // Le jeton ne permet plus rien, et on ne peut plus se connecter.
    expect((await as(alice).get('/api/users/me')).status).toBe(401);
    const login = await api().post('/api/auth/local').send({ identifier: alice.email, password: 'secret123' });
    expect(login.status).toBe(400);
    // Bob ne voit plus la conversation.
    expect((await as(bob).get('/api/conversations')).body.data).toEqual([]);
  });

  it('DELETE /users/:id efface aussi les données liées', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const match = await createMatch(alice, bob);
    await sendMessage(bob, match.documentId, 'Hello');

    const res = await as(alice).delete(`/api/users/${alice.id}`);
    expect(res.status).toBe(200);
    expect(await strapi.db.query(MESSAGE_UID).count({})).toBe(0);
    expect(await strapi.db.query('api::match.match').count({})).toBe(0);
  });
});

describe('Purge des messages archivés', () => {
  it('supprime seulement les archives plus anciennes que la durée de conservation', async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const match = await createMatch(alice, bob);
    for (const text of ['vieux', 'récent', 'actif']) await sendMessage(alice, match.documentId, text);

    const byContent = async (content) => strapi.db.query(MESSAGE_UID).findOne({ where: { content } });
    const day = 24 * 60 * 60 * 1000;
    await strapi.db.query(MESSAGE_UID).update({
      where: { id: (await byContent('vieux')).id },
      data: { deletedAt: new Date(Date.now() - 40 * day), deletedReason: 'unmatch' },
    });
    await strapi.db.query(MESSAGE_UID).update({
      where: { id: (await byContent('récent')).id },
      data: { deletedAt: new Date(Date.now() - 5 * day), deletedReason: 'unmatch' },
    });

    const purged = await strapi.service(MESSAGE_UID).purgeArchived(30);

    expect(purged).toBe(1);
    const left = await strapi.db.query(MESSAGE_UID).findMany({ select: ['content'] });
    expect(left.map((m) => m.content).sort()).toEqual(['actif', 'récent']);
  });
});

describe('Mot de passe oublié', () => {
  it('envoie un lien vers l’app puis accepte le nouveau mot de passe', async () => {
    const user = await createUser();
    const send = jest.spyOn(strapi.plugin('email').service('email'), 'send');

    const res = await api().post('/api/auth/forgot-password').send({ email: user.email });
    expect(res.status).toBe(200);

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toContain('nouveau mot de passe');
    const { resetPasswordToken } = await strapi.db.query(USER_UID).findOne({ where: { id: user.id } });
    expect(mail.html).toContain(`/reset-password?code=${resetPasswordToken}`);
    send.mockRestore();

    const reset = await api()
      .post('/api/auth/reset-password')
      .send({ code: resetPasswordToken, password: 'nouveau-secret', passwordConfirmation: 'nouveau-secret' });
    expect(reset.status).toBe(200);

    const login = await api().post('/api/auth/local').send({ identifier: user.email, password: 'nouveau-secret' });
    expect(login.status).toBe(200);
  });

  it('ne révèle pas si une adresse a un compte', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'inconnu@test.fr' });
    expect(res.status).toBe(200);
  });
});
