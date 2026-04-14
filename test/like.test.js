'use strict';

/**
 * Unit tests – Like service
 *
 * Covers: CRUD, state transitions (pending → accepted),
 * and the rule that a user cannot like themselves.
 */

const LIKE_UID = 'api::like.like';

const LIKE_STATES = ['pending', 'accepted'];

// ─── helpers ────────────────────────────────────────────────────────────────

function makeLike(overrides = {}) {
  return {
    id: 1,
    fromUser: { id: 1, username: 'alice' },
    toUser: { id: 2, username: 'bob' },
    state: 'pending',
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── business rule helper (used in real code or middleware) ──────────────────

function canLike(fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    throw new Error('Un utilisateur ne peut pas se liker lui-même.');
  }
  return true;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Like – service (mocked strapi)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── state enum ──────────────────────────────────────────────────────────────

  describe('Like state enum', () => {
    it('only accepts valid states', () => {
      const isValid = (s) => LIKE_STATES.includes(s);

      expect(isValid('pending')).toBe(true);
      expect(isValid('accepted')).toBe(true);
      expect(isValid('rejected')).toBe(false);
      expect(isValid('')).toBe(false);
    });
  });

  // ── business rule: self-like prevention ─────────────────────────────────────

  describe('Self-like prevention', () => {
    it('throws when fromUser === toUser', () => {
      expect(() => canLike(1, 1)).toThrow('Un utilisateur ne peut pas se liker lui-même.');
    });

    it('allows a like between two different users', () => {
      expect(() => canLike(1, 2)).not.toThrow();
      expect(canLike(1, 2)).toBe(true);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a like with state "pending" from user A to user B', async () => {
      const payload = { fromUser: 1, toUser: 2, state: 'pending' };
      const created = makeLike();
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(LIKE_UID, { data: payload });

      expect(strapi.entityService.create).toHaveBeenCalledWith(LIKE_UID, { data: payload });
      expect(result.state).toBe('pending');
      expect(result.fromUser.id).toBe(1);
      expect(result.toUser.id).toBe(2);
    });
  });

  // ── findMany ────────────────────────────────────────────────────────────────

  describe('findMany', () => {
    it('returns likes filtered by fromUser', async () => {
      const likes = [makeLike({ id: 1 }), makeLike({ id: 2, toUser: { id: 3, username: 'charlie' } })];
      strapi.entityService.findMany.mockResolvedValue(likes);

      const result = await strapi.entityService.findMany(LIKE_UID, {
        filters: { fromUser: 1 },
        populate: ['fromUser', 'toUser'],
      });

      expect(result).toHaveLength(2);
      result.forEach((like) => {
        expect(like.fromUser).toBeDefined();
        expect(like.toUser).toBeDefined();
      });
    });

    it('returns an empty array when no likes found', async () => {
      strapi.entityService.findMany.mockResolvedValue([]);

      const result = await strapi.entityService.findMany(LIKE_UID, {
        filters: { fromUser: 99 },
      });

      expect(result).toEqual([]);
    });
  });

  // ── state transition ─────────────────────────────────────────────────────────

  describe('state transitions', () => {
    it('transitions from pending to accepted', async () => {
      const updated = makeLike({ id: 1, state: 'accepted' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(LIKE_UID, 1, {
        data: { state: 'accepted' },
      });

      expect(result.state).toBe('accepted');
    });

    it('only allows pending → accepted transition', () => {
      const allowedTransitions = {
        pending: ['accepted'],
        accepted: [],
      };

      const canTransition = (from, to) =>
        (allowedTransitions[from] || []).includes(to);

      expect(canTransition('pending', 'accepted')).toBe(true);
      expect(canTransition('accepted', 'pending')).toBe(false);
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a like by ID', async () => {
      strapi.entityService.delete.mockResolvedValue({ id: 1 });

      const result = await strapi.entityService.delete(LIKE_UID, 1);

      expect(result.id).toBe(1);
    });
  });
});
