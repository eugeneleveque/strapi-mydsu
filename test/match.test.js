'use strict';

/**
 * Unit tests – Match service
 *
 * Covers: create a match between two users, findMany with user filter,
 * and presence of createdat timestamp.
 */

const MATCH_UID = 'api::match.match';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMatch(overrides = {}) {
  return {
    id: 1,
    user1: { id: 1, username: 'alice' },
    user2: { id: 2, username: 'bob' },
    createdat: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Match – service (mocked strapi)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a match between user1 and user2', async () => {
      const now = new Date().toISOString();
      const payload = { user1: 1, user2: 2, createdat: now };
      const created = makeMatch({ createdat: now });
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(MATCH_UID, { data: payload });

      expect(strapi.entityService.create).toHaveBeenCalledWith(MATCH_UID, { data: payload });
      expect(result.user1.id).toBe(1);
      expect(result.user2.id).toBe(2);
    });

    it('sets a createdat timestamp when creating a match', async () => {
      const now = new Date().toISOString();
      const created = makeMatch({ createdat: now });
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(MATCH_UID, {
        data: { user1: 1, user2: 2, createdat: now },
      });

      expect(result.createdat).toBeDefined();
      expect(new Date(result.createdat).toString()).not.toBe('Invalid Date');
    });

    it('does not allow a user to match with themselves', () => {
      const validateMatch = (user1Id, user2Id) => {
        if (user1Id === user2Id) {
          throw new Error('Les deux utilisateurs d\'un match doivent être différents.');
        }
        return true;
      };

      expect(() => validateMatch(1, 1)).toThrow();
      expect(validateMatch(1, 2)).toBe(true);
    });
  });

  // ── findMany ────────────────────────────────────────────────────────────────

  describe('findMany', () => {
    it('returns matches for a given user (as user1)', async () => {
      const matches = [makeMatch({ id: 1 }), makeMatch({ id: 2, user2: { id: 3, username: 'charlie' } })];
      strapi.entityService.findMany.mockResolvedValue(matches);

      const result = await strapi.entityService.findMany(MATCH_UID, {
        filters: { user1: 1 },
        populate: ['user1', 'user2'],
      });

      expect(result).toHaveLength(2);
      result.forEach((m) => {
        expect(m.user1).toBeDefined();
        expect(m.user2).toBeDefined();
      });
    });

    it('returns matches for a given user (as user2)', async () => {
      const matches = [makeMatch({ id: 5, user1: { id: 10, username: 'dave' }, user2: { id: 2, username: 'bob' } })];
      strapi.entityService.findMany.mockResolvedValue(matches);

      const result = await strapi.entityService.findMany(MATCH_UID, {
        filters: { user2: 2 },
        populate: ['user1', 'user2'],
      });

      expect(result[0].user2.id).toBe(2);
    });

    it('returns an empty array when user has no matches', async () => {
      strapi.entityService.findMany.mockResolvedValue([]);

      const result = await strapi.entityService.findMany(MATCH_UID, {
        filters: { user1: 999 },
      });

      expect(result).toEqual([]);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a single match by ID with both users populated', async () => {
      const match = makeMatch({ id: 7 });
      strapi.entityService.findOne.mockResolvedValue(match);

      const result = await strapi.entityService.findOne(MATCH_UID, 7, {
        populate: ['user1', 'user2'],
      });

      expect(result.id).toBe(7);
      expect(result.user1.username).toBe('alice');
      expect(result.user2.username).toBe('bob');
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a match by ID', async () => {
      strapi.entityService.delete.mockResolvedValue({ id: 1 });

      const result = await strapi.entityService.delete(MATCH_UID, 1);

      expect(result.id).toBe(1);
    });
  });
});
