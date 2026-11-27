'use strict';

const request = require('supertest');
const { setupStrapi, stopStrapi, httpServer } = require('../helpers/strapi');

const SECRET = 'secret-de-test-suffisamment-long-0123456789';
const auth = { Authorization: `Bearer ${SECRET}` };

const partner = (extra = {}) => ({
  name: 'Le Bar Test',
  email: 'Bar@Test.fr',
  category: 'bar',
  states: 'active',
  city: 'Angers',
  postalCode: '49000',
  ...extra,
});

const create = (data, headers = auth) =>
  request(httpServer()).post('/api/partner-admin/partners').set(headers).send({ data });

const login = (email, password) =>
  request(httpServer()).post('/api/partner-portal/login').send({ email, password });

const versions = (documentId) =>
  strapi.db.query('api::partner.partner').findMany({ where: { documentId } });

beforeAll(async () => {
  process.env.BLOG_API_SECRET = SECRET;
  await setupStrapi('partner-admin');
});

afterAll(async () => {
  await stopStrapi();
});

beforeEach(async () => {
  await strapi.db.query('api::partner.partner').deleteMany({ where: {} });
});

describe('partner-admin', () => {
  it('refuses calls without the right secret', async () => {
    await create(partner(), {}).expect(401);
    await create(partner(), { Authorization: 'Bearer autre' }).expect(401);
    await request(httpServer()).get('/api/partner-admin/partners').expect(401);

    process.env.BLOG_API_SECRET = '';
    await create(partner(), { Authorization: 'Bearer ' }).expect(401);
    process.env.BLOG_API_SECRET = SECRET;
  });

  it('creates an active partner who can log in with the returned password', async () => {
    const { body } = await create(partner()).expect(201);

    expect(body.data.email).toBe('bar@test.fr');
    expect(body.data.password.length).toBeGreaterThanOrEqual(12);
    await login('bar@test.fr', body.data.password).expect(200);

    const rows = await versions(body.data.documentId);
    expect(rows).toHaveLength(2);
    // Never stored in clear text.
    rows.forEach((row) => expect(row.password).not.toBe(body.data.password));

    const list = await request(httpServer()).get('/api/partner-admin/partners').set(auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].password).toBeUndefined();
  });

  it('keeps a pending partner unpublished until activated, and blocks a suspended one', async () => {
    const { body } = await create(partner({ states: 'pending' })).expect(201);
    const { documentId, password } = body.data;
    expect(await versions(documentId)).toHaveLength(1);

    const state = (states) =>
      request(httpServer()).put(`/api/partner-admin/partners/${documentId}/state`).set(auth).send({ data: { states } });

    await state('active').expect(200);
    expect(await versions(documentId)).toHaveLength(2);
    await login('bar@test.fr', password).expect(200);

    await state('suspended').expect(200);
    await login('bar@test.fr', password).expect(401);
    (await versions(documentId)).forEach((row) => expect(row.states).toBe('suspended'));

    await state('nimporte').expect(400);
  });

  it('rejects invalid or duplicate data', async () => {
    await create(partner({ name: '' })).expect(400);
    await create(partner({ email: 'pas-un-email' })).expect(400);
    await create(partner({ category: 'inconnue' })).expect(400);
    await create(partner({ states: 'suspended' })).expect(400);
    await create(partner({ postalCode: '49' })).expect(400);

    await create(partner()).expect(201);
    await create(partner({ email: 'BAR@test.fr' })).expect(400);
  });
});
