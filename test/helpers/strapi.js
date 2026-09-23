'use strict';

/**
 * Boots a real Strapi instance for integration tests, on a throwaway SQLite
 * database. Each test file gets its own database file, so suites stay
 * independent (they must run sequentially: see jest maxWorkers).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let instance;
let databaseFile;

async function setupStrapi(name = `test-${process.pid}`) {
  if (instance) return instance;

  databaseFile = path.join('.tmp', `${name}.db`);
  const absoluteDatabaseFile = path.join(ROOT, databaseFile);
  fs.rmSync(absoluteDatabaseFile, { force: true });

  // Never touch the real database or the Supabase bucket from the tests.
  process.env.NODE_ENV = 'test';
  // Keep the test output readable: only Strapi errors.
  process.env.STRAPI_LOG_LEVEL = process.env.STRAPI_LOG_LEVEL ?? 'error';
  process.env.DATABASE_CLIENT = 'sqlite';
  process.env.DATABASE_FILENAME = databaseFile;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_HOST;
  delete process.env.SUPABASE_API_URL;
  delete process.env.DATABASE_API_URL;

  const { compileStrapi, createStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  instance = await createStrapi(appContext).load();
  await instance.server.mount();

  return instance;
}

async function stopStrapi() {
  if (instance) {
    await instance.destroy();
    instance = undefined;
  }

  if (databaseFile) {
    fs.rmSync(path.join(ROOT, databaseFile), { force: true });
    databaseFile = undefined;
  }
}

/**
 * Empties the application data between tests, so counts and lists are
 * predictable. Activities are kept (suites create them once, upfront).
 */
async function resetData({ keepActivities = true } = {}) {
  const uids = [
    'api::message.message',
    'api::booking.booking',
    'api::like.like',
    'api::match.match',
    ...(keepActivities ? [] : ['api::activity.activity']),
    'plugin::users-permissions.user',
  ];

  for (const uid of uids) {
    await instance.db.query(uid).deleteMany({ where: {} });
  }
}

/** The HTTP server to pass to supertest. */
const httpServer = () => instance.server.httpServer;

module.exports = { setupStrapi, stopStrapi, resetData, httpServer };
