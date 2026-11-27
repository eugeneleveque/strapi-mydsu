'use strict';

/** Partner space: public page, photos and messages with the team. */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupStrapi, stopStrapi, httpServer } = require('../helpers/strapi');
const { PNG_FIXTURE } = require('../helpers/factories');

const SECRET = 'secret-de-test-suffisamment-long-0123456789';
const team = { Authorization: `Bearer ${SECRET}` };

jest.setTimeout(120000);

const api = () => request(httpServer());
const png = () => (Buffer.isBuffer(PNG_FIXTURE) ? PNG_FIXTURE : fs.readFileSync(path.resolve(PNG_FIXTURE)));

/** Creates an active partner and logs it in. */
async function createPartner(email = 'bar@test.fr') {
  const { body } = await api()
    .post('/api/partner-admin/partners')
    .set(team)
    .send({ data: { name: 'Le Bar Test', email, category: 'bar', states: 'active', city: 'Angers' } })
    .expect(201);
  const login = await api().post('/api/partner-portal/login').send({ email, password: body.data.password }).expect(200);

  return { documentId: body.data.documentId, auth: { Authorization: `Bearer ${login.body.token}` } };
}

const versions = (documentId) =>
  strapi.db.query('api::partner.partner').findMany({ where: { documentId }, populate: { coverImage: true } });

const sendPhoto = (auth, content = png(), name = 'photo.png') =>
  api().post('/api/partner-portal/photos').set(auth).attach('photo', content, { filename: name, contentType: 'image/png' });

beforeAll(async () => {
  process.env.BLOG_API_SECRET = SECRET;
  await setupStrapi('partner-space');
});

afterAll(() => stopStrapi());

beforeEach(async () => {
  await strapi.db.query('api::partner.partner').deleteMany({ where: {} });
  await strapi.db.query('api::partner-message.partner-message').deleteMany({ where: {} });
});

describe('partner profile', () => {
  it('updates both versions, and nothing the partner may not change', async () => {
    const { documentId, auth } = await createPartner();

    const { body } = await api()
      .put('/api/partner-portal/profile')
      .set(auth)
      .send({
        data: {
          address: '1 rue du Test',
          postalCode: '49000',
          phone: '+33 6 12 34 56 78',
          website: 'https://bar.test',
          description: 'Un bar.',
          openingHours: { monday: 'Fermé', friday: '18h - 2h', funday: 'x' },
          name: 'Pirate',
          states: 'pending',
          email: 'autre@test.fr',
        },
      })
      .expect(200);

    expect(body.data.phone).toBe('0612345678');
    expect(body.data.openingHours.friday).toBe('18h - 2h');
    expect(body.data.openingHours).not.toHaveProperty('funday');

    const rows = await versions(documentId);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.description).toBe('Un bar.');
      expect(row.name).toBe('Le Bar Test');
      expect(row.states).toBe('active');
      expect(row.email).toBe('bar@test.fr');
    });
  });

  it('refuses invalid values and anonymous calls', async () => {
    const { auth } = await createPartner();
    const put = (data) => api().put('/api/partner-portal/profile').set(auth).send({ data });

    await put({ website: 'javascript:alert(1)' }).expect(400);
    await put({ phone: '12' }).expect(400);
    await put({ postalCode: 'abc' }).expect(400);
    await api().get('/api/partner-portal/profile').expect(401);
  });
});

describe('partner photos', () => {
  it('adds photos to both versions and removes only its own', async () => {
    const first = await createPartner();
    const other = await createPartner('autre@test.fr');

    const { body } = await sendPhoto(first.auth).expect(201);
    const [photo] = body.data.photos;
    expect(photo.url).toEqual(expect.any(String));
    const second = await sendPhoto(first.auth).expect(201);
    expect(second.body.data.photos).toHaveLength(2);
    (await versions(first.documentId)).forEach((row) => expect(row.coverImage).toHaveLength(2));

    await api().delete(`/api/partner-portal/photos/${photo.id}`).set(other.auth).expect(404);
    const after = await api().delete(`/api/partner-portal/photos/${photo.id}`).set(first.auth).expect(200);
    expect(after.body.data.photos).toHaveLength(1);
    (await versions(first.documentId)).forEach((row) => expect(row.coverImage).toHaveLength(1));
  });

  it('refuses a file that is not an image, whatever it claims', async () => {
    const { auth } = await createPartner();

    await sendPhoto(auth, Buffer.from('<html><script>alert(1)</script></html>')).expect(400);
  });
});

describe('partner messages', () => {
  it('lets the partner and the team talk, and tracks unread messages', async () => {
    const { documentId, auth } = await createPartner();
    const other = await createPartner('autre@test.fr');

    await api().post('/api/partner-portal/messages').set(auth).send({ data: { content: '  Bonjour  ' } }).expect(201);
    await api().post('/api/partner-portal/messages').set(auth).send({ data: { content: ' ' } }).expect(400);

    const inbox = () => api().get('/api/partner-admin/conversations').set(team).expect(200);
    expect((await inbox()).body.data).toMatchObject([{ documentId, unread: 1, lastMessage: { content: 'Bonjour' } }]);

    const thread = await api().get(`/api/partner-admin/partners/${documentId}/messages`).set(team).expect(200);
    expect(thread.body.data.partner.name).toBe('Le Bar Test');
    expect((await inbox()).body.data[0].unread).toBe(0);

    await api().post(`/api/partner-admin/partners/${documentId}/messages`).set(team).send({ data: { content: 'Salut' } }).expect(201);

    const mine = await api().get('/api/partner-portal/messages').set(auth).expect(200);
    expect(mine.body.data.map((message) => [message.content, message.fromTeam])).toEqual([['Bonjour', false], ['Salut', true]]);
    const theirs = await api().get('/api/partner-portal/messages').set(other.auth).expect(200);
    expect(theirs.body.data).toEqual([]);
  });

  it('keeps messages out of reach without credentials', async () => {
    const { documentId } = await createPartner();

    await api().get('/api/partner-admin/conversations').expect(401);
    await api().get(`/api/partner-admin/partners/${documentId}/messages`).expect(401);
    await api().get('/api/partner-portal/messages').expect(401);
    await api().get('/api/partner-messages').expect(404);
  });
});
