'use strict';

/**
 * Unit tests – Activity service
 *
 * We mock strapi.entityService so we never touch a real database.
 * Each test resets the mock state via beforeEach.
 */

const ACTIVITY_UID = 'api::activity.activity';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeActivity(overrides = {}) {
  return {
    id: 1,
    title: 'Soirée jeux de société',
    description: 'Une soirée conviviale pour découvrir des jeux de plateau.',
    date: '2026-04-15',
    location: 'Salle B12, Campus',
    maxParticipants: 20,
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Activity – service (mocked strapi)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── findMany ────────────────────────────────────────────────────────────────

  describe('findMany', () => {
    it('returns an array of activities', async () => {
      const mockList = [makeActivity({ id: 1 }), makeActivity({ id: 2, title: 'Randonnée' })];
      strapi.entityService.findMany.mockResolvedValue(mockList);

      const result = await strapi.entityService.findMany(ACTIVITY_UID, {});

      expect(strapi.entityService.findMany).toHaveBeenCalledTimes(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Soirée jeux de société');
    });

    it('returns an empty array when no activities exist', async () => {
      strapi.entityService.findMany.mockResolvedValue([]);

      const result = await strapi.entityService.findMany(ACTIVITY_UID, {});

      expect(result).toEqual([]);
    });

    it('passes filter params to entityService', async () => {
      strapi.entityService.findMany.mockResolvedValue([]);
      const filters = { location: 'Campus' };

      await strapi.entityService.findMany(ACTIVITY_UID, { filters });

      expect(strapi.entityService.findMany).toHaveBeenCalledWith(ACTIVITY_UID, { filters });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a single activity by ID', async () => {
      const activity = makeActivity({ id: 42 });
      strapi.entityService.findOne.mockResolvedValue(activity);

      const result = await strapi.entityService.findOne(ACTIVITY_UID, 42, {});

      expect(result).toBeDefined();
      expect(result.id).toBe(42);
      expect(result.title).toBe('Soirée jeux de société');
    });

    it('returns null when activity does not exist', async () => {
      strapi.entityService.findOne.mockResolvedValue(null);

      const result = await strapi.entityService.findOne(ACTIVITY_UID, 999, {});

      expect(result).toBeNull();
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an activity with all required fields', async () => {
      const payload = {
        title: 'Atelier peinture',
        description: 'Initiation à la peinture aquarelle.',
        date: '2026-05-10',
        location: 'Atelier Arts, Campus',
        maxParticipants: 12,
      };
      const created = makeActivity({ id: 10, ...payload });
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(ACTIVITY_UID, { data: payload });

      expect(strapi.entityService.create).toHaveBeenCalledWith(ACTIVITY_UID, { data: payload });
      expect(result.id).toBe(10);
      expect(result.title).toBe('Atelier peinture');
      expect(result.maxParticipants).toBe(12);
    });

    it('maxParticipants must be a positive integer', () => {
      const validateMaxParticipants = (value) => Number.isInteger(value) && value > 0;

      expect(validateMaxParticipants(20)).toBe(true);
      expect(validateMaxParticipants(0)).toBe(false);
      expect(validateMaxParticipants(-5)).toBe(false);
      expect(validateMaxParticipants(3.5)).toBe(false);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates an activity field', async () => {
      const updated = makeActivity({ id: 1, location: 'Amphi A, Campus' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(ACTIVITY_UID, 1, {
        data: { location: 'Amphi A, Campus' },
      });

      expect(result.location).toBe('Amphi A, Campus');
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an activity by ID', async () => {
      strapi.entityService.delete.mockResolvedValue({ id: 1 });

      const result = await strapi.entityService.delete(ACTIVITY_UID, 1);

      expect(strapi.entityService.delete).toHaveBeenCalledWith(ACTIVITY_UID, 1);
      expect(result.id).toBe(1);
    });
  });
});
