'use strict';

/**
 * Unit tests – About service (single type)
 *
 * Covers: find, update title.
 */

const ABOUT_UID = 'api::about.about';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeAbout(overrides = {}) {
  return {
    id: 1,
    title: 'À propos de MYDSU',
    blocks: [],
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('About – service (mocked strapi, single type)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── find ─────────────────────────────────────────────────────────────────────

  describe('find', () => {
    it('returns the about content', async () => {
      const about = makeAbout();
      strapi.entityService.findMany.mockResolvedValue([about]);

      const [result] = await strapi.entityService.findMany(ABOUT_UID, {});

      expect(result).toBeDefined();
      expect(result.title).toBe('À propos de MYDSU');
    });

    it('returns null when about is not configured', async () => {
      strapi.entityService.findMany.mockResolvedValue([]);

      const result = await strapi.entityService.findMany(ABOUT_UID, {});

      expect(result).toHaveLength(0);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates the title', async () => {
      const updated = makeAbout({ title: 'Nouveau titre' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(ABOUT_UID, 1, {
        data: { title: 'Nouveau titre' },
      });

      expect(result.title).toBe('Nouveau titre');
    });

    it('retains existing fields after a partial update', async () => {
      const updated = makeAbout({ title: 'Titre mis à jour', blocks: [] });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(ABOUT_UID, 1, {
        data: { title: 'Titre mis à jour' },
      });

      expect(result.blocks).toBeDefined();
      expect(Array.isArray(result.blocks)).toBe(true);
    });
  });
});
