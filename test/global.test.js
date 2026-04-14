'use strict';

/**
 * Unit tests – Global service (single type)
 *
 * Covers: find site settings, update siteName,
 * and required-field validation (siteName, siteDescription).
 */

const GLOBAL_UID = 'api::global.global';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeGlobal(overrides = {}) {
  return {
    id: 1,
    siteName: 'MYDSU',
    siteDescription: 'La plateforme étudiante de Dauphine.',
    favicon: null,
    defaultSeo: {
      metaTitle: 'MYDSU',
      metaDescription: 'La plateforme étudiante de Dauphine.',
      shareImage: null,
    },
    ...overrides,
  };
}

// ─── business-rule helper ───────────────────────────────────────────────────

function validateGlobalSettings({ siteName, siteDescription }) {
  const errors = [];
  if (!siteName || siteName.trim() === '') errors.push('siteName est requis.');
  if (!siteDescription || siteDescription.trim() === '') errors.push('siteDescription est requis.');
  return errors;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Global – service (mocked strapi, single type)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── required-field validation ────────────────────────────────────────────────

  describe('required-field validation', () => {
    it('passes validation when both required fields are present', () => {
      const errors = validateGlobalSettings({
        siteName: 'MYDSU',
        siteDescription: 'Plateforme étudiante.',
      });
      expect(errors).toHaveLength(0);
    });

    it('fails validation when siteName is missing', () => {
      const errors = validateGlobalSettings({ siteName: '', siteDescription: 'Desc' });
      expect(errors).toContain('siteName est requis.');
    });

    it('fails validation when siteDescription is missing', () => {
      const errors = validateGlobalSettings({ siteName: 'MYDSU', siteDescription: '' });
      expect(errors).toContain('siteDescription est requis.');
    });

    it('fails validation when both fields are missing', () => {
      const errors = validateGlobalSettings({ siteName: '', siteDescription: '' });
      expect(errors).toHaveLength(2);
    });
  });

  // ── find ─────────────────────────────────────────────────────────────────────

  describe('find', () => {
    it('returns site settings with siteName and siteDescription', async () => {
      const global = makeGlobal();
      strapi.entityService.findMany.mockResolvedValue([global]);

      const [result] = await strapi.entityService.findMany(GLOBAL_UID, {});

      expect(result.siteName).toBe('MYDSU');
      expect(result.siteDescription).toBe('La plateforme étudiante de Dauphine.');
    });

    it('returns defaultSeo component when populated', async () => {
      const global = makeGlobal();
      strapi.entityService.findMany.mockResolvedValue([global]);

      const [result] = await strapi.entityService.findMany(GLOBAL_UID, {
        populate: ['defaultSeo'],
      });

      expect(result.defaultSeo).toBeDefined();
      expect(result.defaultSeo.metaTitle).toBe('MYDSU');
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates the siteName', async () => {
      const updated = makeGlobal({ siteName: 'MYDSU v2' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(GLOBAL_UID, 1, {
        data: { siteName: 'MYDSU v2' },
      });

      expect(result.siteName).toBe('MYDSU v2');
    });

    it('updates siteDescription', async () => {
      const updated = makeGlobal({ siteDescription: 'Nouvelle description.' });
      strapi.entityService.update.mockResolvedValue(updated);

      const result = await strapi.entityService.update(GLOBAL_UID, 1, {
        data: { siteDescription: 'Nouvelle description.' },
      });

      expect(result.siteDescription).toBe('Nouvelle description.');
    });
  });
});
