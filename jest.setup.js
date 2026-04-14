/**
 * jest.setup.js
 * Global mock for the `strapi` object used in service unit tests.
 * This replaces the real Strapi application with a lightweight mock
 * so tests run without starting the server or connecting to a DB.
 */

'use strict';

global.strapi = {
  entityService: {
    findMany: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
};
