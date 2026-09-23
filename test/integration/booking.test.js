'use strict';

/**
 * Réservations : l'organisateur vient du token, on n'invite que ses matchs,
 * et les places de l'activité sont respectées.
 */

const { setupStrapi, stopStrapi } = require('../helpers/strapi');
const { as, createUser, createMatch, createActivity } = require('../helpers/factories');

jest.setTimeout(120000);

let activity;

beforeAll(async () => {
  await setupStrapi('booking');
  activity = await createActivity({ title: 'Escape game', maxParticipants: 3 });
});
afterAll(() => stopStrapi());

/** Alice et Bob matchés, plus Carol qui n'a rien à voir avec eux. */
async function contexte() {
  const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
  await createMatch(alice, bob);
  return { alice, bob, carol };
}

const creerReservation = (organisateur, data = {}) =>
  as(organisateur)
    .post('/api/bookings')
    .send({ data: { activity: activity.documentId, date: '2026-10-01', time: '18:30', ...data } });

describe('Création', () => {
  it('crée la réservation, force l’organisateur et l’état, et recopie le nom de l’activité', async () => {
    const { alice, bob, carol } = await contexte();

    const res = await creerReservation(alice, {
      participants: [bob.id],
      organizer: carol.id,
      state: 'confirmed',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.state).toBe('pending');
    expect(res.body.data.activityName).toBe('Escape game');
    expect(res.body.data.date).toBe('2026-10-01');

    const enBase = await strapi.db.query('api::booking.booking').findOne({
      where: { documentId: res.body.data.documentId },
      populate: { organizer: true },
    });
    expect(enBase.organizer.id).toBe(alice.id);
  });

  it('accepte l’heure au format HH:mm envoyé par l’app', async () => {
    const { alice } = await contexte();
    const res = await creerReservation(alice, { time: '09:05' });

    expect(res.status).toBe(201);
    expect(res.body.data.time).toBe('09:05:00.000');
  });

  it('accepte l’identifiant numérique de l’activité', async () => {
    const { alice } = await contexte();
    const res = await creerReservation(alice, { activity: activity.id });

    expect(res.status).toBe(201);
  });

  it('autorise plusieurs réservations sur la même activité', async () => {
    const { alice, bob } = await contexte();

    expect((await creerReservation(alice)).status).toBe(201);
    expect((await creerReservation(bob)).status).toBe(201);
  });

  it('refuse d’inviter quelqu’un qui n’est pas un match', async () => {
    const { alice, carol } = await contexte();
    const res = await creerReservation(alice, { participants: [carol.id] });

    expect(res.status).toBe(403);
  });

  it('refuse de dépasser le nombre de places', async () => {
    const { alice, bob } = await contexte();
    const petiteActivite = await createActivity({ title: 'Duo', maxParticipants: 1 });

    const res = await as(alice)
      .post('/api/bookings')
      .send({ data: { activity: petiteActivite.documentId, participants: [bob.id] } });

    expect(res.status).toBe(400);
  });

  it('refuse une date ou une heure mal formée', async () => {
    const { alice } = await contexte();

    expect((await creerReservation(alice, { date: '01/10/2026' })).status).toBe(400);
    expect((await creerReservation(alice, { time: '25h' })).status).toBe(400);
  });

  it('refuse une activité inexistante ou absente', async () => {
    const { alice } = await contexte();

    expect((await creerReservation(alice, { activity: 'nexistepas' })).status).toBe(404);
    expect((await as(alice).post('/api/bookings').send({ data: {} })).status).toBe(400);
  });
});

describe('Lecture', () => {
  it('montre ses réservations à l’organisateur comme aux participants, mais pas aux autres', async () => {
    const { alice, bob, carol } = await contexte();
    await creerReservation(alice, { participants: [bob.id] });

    expect((await as(alice).get('/api/bookings')).body.data).toHaveLength(1);
    expect((await as(bob).get('/api/bookings')).body.data).toHaveLength(1);
    expect((await as(carol).get('/api/bookings')).body.data).toHaveLength(0);
  });
});

describe('Modification', () => {
  it('laisse l’organisateur confirmer, mais refuse un retour en arrière', async () => {
    const { alice } = await contexte();
    const { body } = await creerReservation(alice);

    const confirme = await as(alice)
      .put(`/api/bookings/${body.data.documentId}`)
      .send({ data: { state: 'confirmed', time: '19:00' } });
    expect(confirme.status).toBe(200);
    expect(confirme.body.data.state).toBe('confirmed');

    const retour = await as(alice)
      .put(`/api/bookings/${body.data.documentId}`)
      .send({ data: { state: 'pending' } });
    expect(retour.status).toBe(400);
  });

  it('refuse qu’un participant modifie la réservation', async () => {
    const { alice, bob } = await contexte();
    const { body } = await creerReservation(alice, { participants: [bob.id] });

    const res = await as(bob).put(`/api/bookings/${body.data.documentId}`).send({ data: { state: 'cancelled' } });

    expect(res.status).toBe(404);
  });

  it('laisse l’organisateur gérer la liste des invités', async () => {
    const { alice, bob, carol } = await contexte();
    await createMatch(alice, carol);
    const { body } = await creerReservation(alice);

    const ajout = await as(alice)
      .put(`/api/bookings/${body.data.documentId}`)
      .send({ data: { participants: [bob.id, carol.id, bob.id] } });

    expect(ajout.status).toBe(200);

    const enBase = await strapi.db.query('api::booking.booking').findOne({
      where: { documentId: body.data.documentId, publishedAt: { $notNull: true } },
      populate: { participants: true },
    });
    expect(enBase.participants.map((participant) => participant.id).sort()).toEqual([bob.id, carol.id].sort());
  });
});

describe('Réservations de groupe', () => {
  it('laisse un participant quitter la réservation', async () => {
    const { alice, bob } = await contexte();
    const { body } = await creerReservation(alice, { participants: [bob.id] });

    const res = await as(bob).post(`/api/bookings/${body.data.documentId}/leave`);

    expect(res.status).toBe(200);
    expect((await as(bob).get('/api/bookings')).body.data).toHaveLength(0);
    expect((await as(alice).get('/api/bookings')).body.data).toHaveLength(1);
  });

  it('demande à l’organisateur d’annuler plutôt que de quitter', async () => {
    const { alice, bob } = await contexte();
    const { body } = await creerReservation(alice, { participants: [bob.id] });

    const res = await as(alice).post(`/api/bookings/${body.data.documentId}/leave`);

    expect(res.status).toBe(403);
  });
});

describe('Suppression', () => {
  it('laisse l’organisateur supprimer, pas les autres', async () => {
    const { alice, bob } = await contexte();
    const { body } = await creerReservation(alice, { participants: [bob.id] });

    expect((await as(bob).delete(`/api/bookings/${body.data.documentId}`)).status).toBe(404);
    expect([200, 204]).toContain((await as(alice).delete(`/api/bookings/${body.data.documentId}`)).status);
  });
});

describe('Activités (lecture seule)', () => {
  it('sont lisibles publiquement mais pas modifiables par l’API', async () => {
    const { alice } = await contexte();
    const { api } = require('../helpers/factories');

    expect((await api().get('/api/activities')).status).toBe(200);
    expect((await as(alice).post('/api/activities').send({ data: { title: 'x' } })).status).not.toBe(201);
  });

  it('n’expose pas les réservations à travers les activités', async () => {
    const { alice } = await contexte();
    await creerReservation(alice);

    const res = await as(alice).get('/api/activities?populate=*');

    expect(JSON.stringify(res.body)).not.toContain('bookings');
  });
});
