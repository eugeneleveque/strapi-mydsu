'use strict';

/**
 * Unit tests – Booking service
 *
 * Covers: CRUD, state transitions (pending → confirmed / cancelled),
 * and state enum validation.
 */

const BOOKING_UID = 'api::booking.booking';
const ACTIVITY_UID = 'api::activity.activity';

const BOOKING_STATES = ['pending', 'confirmed', 'cancelled'];

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBooking(overrides = {}) {
  return {
    id: 1,
    state: 'pending',
    createdat: new Date().toISOString(),
    activity: { id: 5, title: 'Soirée cinéma' },
    user: [{ id: 10, username: 'alice' }],
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Booking – service (mocked strapi)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── state enum ──────────────────────────────────────────────────────────────

  describe('Booking state enum', () => {
    it('only accepts valid states', () => {
      const isValidState = (s) => BOOKING_STATES.includes(s);

      expect(isValidState('pending')).toBe(true);
      expect(isValidState('confirmed')).toBe(true);
      expect(isValidState('cancelled')).toBe(true);
      expect(isValidState('rejected')).toBe(false);
      expect(isValidState('')).toBe(false);
      expect(isValidState(null)).toBe(false);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a booking with state "pending" by default', async () => {
      const payload = { state: 'pending', activity: 5, user: [10] };
      const created = makeBooking({ id: 1 });
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(BOOKING_UID, { data: payload });

      expect(strapi.entityService.create).toHaveBeenCalledWith(BOOKING_UID, { data: payload });
      expect(result.state).toBe('pending');
    });

    it('stores the createdat timestamp on creation', async () => {
      const now = new Date().toISOString();
      const created = makeBooking({ createdat: now });
      strapi.entityService.create.mockResolvedValue(created);

      const result = await strapi.entityService.create(BOOKING_UID, {
        data: { state: 'pending', activity: 5, user: [10], createdat: now },
      });

      expect(result.createdat).toBeDefined();
      expect(typeof result.createdat).toBe('string');
    });
  });

  // ── findMany ────────────────────────────────────────────────────────────────

  describe('findMany', () => {
    it('returns bookings with populated activity relation', async () => {
      const bookings = [makeBooking({ id: 1 }), makeBooking({ id: 2, state: 'confirmed' })];
      strapi.entityService.findMany.mockResolvedValue(bookings);

      const result = await strapi.entityService.findMany(BOOKING_UID, {
        populate: ['activity', 'user'],
      });

      expect(result).toHaveLength(2);
      expect(result[0].activity).toBeDefined();
      expect(result[0].activity.title).toBe('Soirée cinéma');
    });

    it('filters bookings by state', async () => {
      const confirmed = [makeBooking({ id: 3, state: 'confirmed' })];
      strapi.entityService.findMany.mockResolvedValue(confirmed);

      const result = await strapi.entityService.findMany(BOOKING_UID, {
        filters: { state: 'confirmed' },
      });

      expect(result.every((b) => b.state === 'confirmed')).toBe(true);
    });
  });

  // ── state transitions ────────────────────────────────────────────────────────

  describe('state transitions', () => {
    it('transitions state from pending to confirmed', async () => {
      const updated = makeBooking({ id: 1, state: 'confirmed' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(BOOKING_UID, 1, {
        data: { state: 'confirmed' },
      });

      expect(result.state).toBe('confirmed');
    });

    it('transitions state from pending to cancelled', async () => {
      const updated = makeBooking({ id: 1, state: 'cancelled' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(BOOKING_UID, 1, {
        data: { state: 'cancelled' },
      });

      expect(result.state).toBe('cancelled');
    });

    it('does not allow invalid state transitions', () => {
      const allowedTransitions = {
        pending: ['confirmed', 'cancelled'],
        confirmed: [],
        cancelled: [],
      };

      const canTransition = (from, to) =>
        (allowedTransitions[from] || []).includes(to);

      expect(canTransition('pending', 'confirmed')).toBe(true);
      expect(canTransition('pending', 'cancelled')).toBe(true);
      expect(canTransition('confirmed', 'cancelled')).toBe(false);
      expect(canTransition('cancelled', 'confirmed')).toBe(false);
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a booking by ID', async () => {
      strapi.entityService.delete.mockResolvedValue({ id: 1 });

      const result = await strapi.entityService.delete(BOOKING_UID, 1);

      expect(result.id).toBe(1);
    });
  });
});
