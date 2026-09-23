'use strict';

/**
 * Test data builders: users (with their JWT), likes, matches, activities.
 * They go through the real API whenever possible, so the tests exercise the
 * same path as the app.
 */

const request = require('supertest');
const { httpServer } = require('./strapi');

const api = () => request(httpServer());

let counter = 0;
const unique = (prefix) => `${prefix}${Date.now().toString(36)}${counter++}`;

/**
 * Registers a user and returns { id, jwt, username, email }.
 * `profile` fills the columns the API does not accept at registration.
 */
async function createUser(profile = {}) {
  const username = profile.username ?? unique('user');
  const email = profile.email ?? `${username}@test.fr`;

  const res = await api()
    .post('/api/auth/local/register')
    .send({ username, email, password: 'secret123' });

  if (res.status !== 200) {
    throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const { city, gender, age, interests, latitude, longitude, blocked } = profile;
  const columns = { city, gender, age, interests, latitude, longitude, blocked };
  const data = Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));

  if (Object.keys(data).length > 0) {
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: res.body.user.id },
      data,
    });
  }

  return { id: res.body.user.id, jwt: res.body.jwt, username, email };
}

const createUsers = (count, profile = {}) =>
  Promise.all(Array.from({ length: count }, () => createUser(profile)));

/** Sends a like and returns the response. */
const like = (from, toUserId) =>
  api()
    .post('/api/likes')
    .set('Authorization', `Bearer ${from.jwt}`)
    .send({ data: { toUser: toUserId } });

/**
 * Makes two users match and returns the match { id, documentId }.
 */
async function createMatch(userA, userB) {
  await like(userA, userB.id);
  const res = await like(userB, userA.id);

  if (!res.body?.meta?.matched) {
    throw new Error(`createMatch failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.meta.match;
}

async function createActivity(attributes = {}) {
  return strapi.documents('api::activity.activity').create({
    data: {
      title: attributes.title ?? unique('Activité '),
      maxParticipants: attributes.maxParticipants,
      price: attributes.price,
      ...attributes,
    },
    status: 'published',
  });
}

/** Sends a message inside a conversation and returns the response. */
const sendMessage = (from, matchRef, content) =>
  api()
    .post(`/api/conversations/${matchRef}/messages`)
    .set('Authorization', `Bearer ${from.jwt}`)
    .send({ data: { content } });

/** Shorthand for an authenticated request: as(user).get('/api/...') */
const as = (user) => ({
  get: (url) => api().get(url).set('Authorization', `Bearer ${user.jwt}`),
  post: (url) => api().post(url).set('Authorization', `Bearer ${user.jwt}`),
  put: (url) => api().put(url).set('Authorization', `Bearer ${user.jwt}`),
  delete: (url) => api().delete(url).set('Authorization', `Bearer ${user.jwt}`),
});

/** A tiny valid PNG, for upload tests. */
const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = {
  api,
  as,
  createUser,
  createUsers,
  createMatch,
  createActivity,
  like,
  sendMessage,
  unique,
  PNG_FIXTURE,
};
