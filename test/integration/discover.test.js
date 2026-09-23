'use strict';

/**
 * /discover : profils à liker, filtres et distance.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { api, as, createUser, like } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('discover'));
beforeEach(() => resetData());
afterAll(() => stopStrapi());

// Nantes et Paris, pour les tests de distance.
const NANTES = { latitude: 47.218, longitude: -1.553 };
const PARIS = { latitude: 48.857, longitude: 2.352 };

// Date de naissance pour un âge donné.
const naissancePour = (age) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  date.setMonth(0, 15);
  return date.toISOString().slice(0, 10);
};

const idsRenvoyes = (res) => res.body.data.map((profil) => profil.id);

describe('Sélection des profils', () => {
  it('exclut soi-même et les profils déjà likés', async () => {
    const [moi, bob, carol] = [await createUser(), await createUser(), await createUser()];

    const avant = await as(moi).get('/api/discover');
    expect(idsRenvoyes(avant)).toEqual(expect.arrayContaining([bob.id, carol.id]));
    expect(idsRenvoyes(avant)).not.toContain(moi.id);

    await like(moi, bob.id);

    const apres = await as(moi).get('/api/discover');
    expect(idsRenvoyes(apres)).not.toContain(bob.id);
    expect(idsRenvoyes(apres)).toContain(carol.id);
  });

  it('exclut les comptes bloqués', async () => {
    const moi = await createUser();
    const banni = await createUser({ blocked: true });

    const res = await as(moi).get('/api/discover');

    expect(idsRenvoyes(res)).not.toContain(banni.id);
  });

  it('ne renvoie que des champs publics', async () => {
    const moi = await createUser();
    await createUser({ city: 'Nantes', ...NANTES });

    const res = await as(moi).get('/api/discover');

    const profil = res.body.data[0];
    expect(profil).toHaveProperty('username');
    expect(profil).not.toHaveProperty('email');
    expect(profil).not.toHaveProperty('latitude');
  });

  it('exige une authentification', async () => {
    const res = await api().get('/api/discover');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Filtres', () => {
  it('filtre par ville', async () => {
    const moi = await createUser();
    const nantais = await createUser({ city: 'Nantes' });
    await createUser({ city: 'Paris' });

    const res = await as(moi).get('/api/discover?city=Nantes');

    expect(idsRenvoyes(res)).toEqual([nantais.id]);
  });

  it('filtre par tranche d’âge', async () => {
    const moi = await createUser();
    const jeune = await createUser({ age: naissancePour(25) });
    await createUser({ age: naissancePour(60) });

    const res = await as(moi).get('/api/discover?minAge=18&maxAge=35');

    expect(idsRenvoyes(res)).toEqual([jeune.id]);
  });

  it('filtre par centres d’intérêt', async () => {
    const moi = await createUser();
    const grimpeur = await createUser({ interests: ['escalade', 'cinema'] });
    await createUser({ interests: ['jazz'] });

    const res = await as(moi).get('/api/discover?interests=escalade');

    expect(idsRenvoyes(res)).toEqual([grimpeur.id]);
  });

  it('filtre par distance et renvoie les kilomètres', async () => {
    const moi = await createUser(NANTES);
    const voisin = await createUser({ city: 'Nantes', latitude: 47.22, longitude: -1.55 });
    await createUser({ city: 'Paris', ...PARIS });

    const res = await as(moi).get('/api/discover?radius=50');

    expect(idsRenvoyes(res)).toEqual([voisin.id]);
    expect(res.body.data[0].distanceKm).toBeLessThan(5);
  });

  it('trie du plus proche au plus lointain', async () => {
    const moi = await createUser(NANTES);
    const proche = await createUser({ latitude: 47.22, longitude: -1.55 });
    const loin = await createUser({ latitude: 47.6, longitude: -1.55 });

    const res = await as(moi).get('/api/discover?radius=100');

    expect(idsRenvoyes(res)).toEqual([proche.id, loin.id]);
  });

  it('refuse une tranche d’âge incohérente', async () => {
    const moi = await createUser();
    const res = await as(moi).get('/api/discover?minAge=40&maxAge=20');

    expect(res.status).toBe(400);
  });

  it('refuse un paramètre numérique invalide', async () => {
    const moi = await createUser();
    const res = await as(moi).get('/api/discover?radius=beaucoup');

    expect(res.status).toBe(400);
  });
});

describe('Pagination', () => {
  it('découpe les résultats et annonce le total', async () => {
    const moi = await createUser();
    await createUser();
    await createUser();

    const res = await as(moi).get('/api/discover?pageSize=1');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination.total).toBe(2);
    expect(res.body.meta.pagination.pageCount).toBe(2);
  });

  it('plafonne la taille de page demandée', async () => {
    const moi = await createUser();
    const res = await as(moi).get('/api/discover?pageSize=5000');

    expect(res.body.meta.pagination.pageSize).toBe(50);
  });
});
