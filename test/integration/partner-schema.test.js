const { setupStrapi, stopStrapi } = require('../helpers/strapi');
jest.setTimeout(120000);
beforeAll(() => setupStrapi('partner-schema'));
afterAll(() => stopStrapi());

const UID = 'api::partner.partner';

it('accepte une catégorie valide et un google_place_id', async () => {
  const p = await strapi.documents(UID).create({
    data: { name: 'Escape Nantes', category: 'escape_game', google_place_id: 'ChIJ_place_1' },
    status: 'published',
  });
  expect(p.category).toBe('escape_game');
  expect(p.google_place_id).toBe('ChIJ_place_1');
});

it('refuse une catégorie hors liste', async () => {
  await expect(strapi.documents(UID).create({
    data: { name: 'X', category: 'piscine_municipale' },
  })).rejects.toThrow();
});

it('refuse deux partenaires avec le même google_place_id', async () => {
  await strapi.documents(UID).create({ data: { name: 'A', google_place_id: 'ChIJ_doublon' }, status: 'published' });
  await expect(strapi.documents(UID).create({
    data: { name: 'B', google_place_id: 'ChIJ_doublon' }, status: 'published',
  })).rejects.toThrow();
});

it('n’expose pas ces champs comme privés (ils sont publics)', async () => {
  const schema = strapi.getModel(UID);
  expect(schema.attributes.category.private).toBeUndefined();
  expect(schema.attributes.google_place_id.private).toBeUndefined();
});
