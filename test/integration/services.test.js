'use strict';

/**
 * Logique métier testée directement au niveau des services, sans passer par
 * HTTP : règles de transition, formats, calculs de distance et d'âge.
 */

const { setupStrapi, stopStrapi, resetData } = require('../helpers/strapi');
const { createUser, createMatch } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('services'));
beforeEach(() => resetData());
afterAll(() => stopStrapi());

const bookingService = () => strapi.service('api::booking.booking');
const matchService = () => strapi.service('api::match.match');
const messageService = () => strapi.service('api::message.message');

describe('Réservations : transitions d’état', () => {
  it.each([
    ['pending', 'confirmed', true],
    ['pending', 'cancelled', true],
    ['confirmed', 'cancelled', true],
    ['confirmed', 'pending', false],
    ['cancelled', 'confirmed', false],
    ['cancelled', 'pending', false],
  ])('%s → %s vaut %s', (depuis, vers, attendu) => {
    expect(bookingService().canTransition(depuis, vers)).toBe(attendu);
  });
});

describe('Réservations : formats de date et d’heure', () => {
  it('accepte une date ISO et une heure HH:mm', () => {
    expect(() => bookingService().validateDateTime({ date: '2026-10-01', time: '18:30' })).not.toThrow();
  });

  it.each(['01/10/2026', '2026-13-45', 'demain'])('refuse la date %s', (date) => {
    expect(() => bookingService().validateDateTime({ date })).toThrow();
  });

  it.each(['25:00', '7h30', '18h'])('refuse l’heure %s', (time) => {
    expect(() => bookingService().validateDateTime({ time })).toThrow();
  });

  it('complète l’heure au format attendu par la base', () => {
    expect(bookingService().normalizeTime('18:30')).toBe('18:30:00.000');
    expect(bookingService().normalizeTime('09:05:30')).toBe('09:05:30.000');
    expect(bookingService().normalizeTime(undefined)).toBeUndefined();
  });
});

describe('Matchs : ordre des utilisateurs', () => {
  it('range toujours la paire dans le même ordre', () => {
    expect(matchService().orderPair(8, 3)).toEqual({ user1: 3, user2: 8 });
    expect(matchService().orderPair(3, 8)).toEqual({ user1: 3, user2: 8 });
  });

  it('reconnaît deux personnes matchées, dans les deux sens', async () => {
    const [alice, bob, carol] = [await createUser(), await createUser(), await createUser()];
    await createMatch(alice, bob);

    expect(await matchService().areMatched(alice.id, bob.id)).toBe(true);
    expect(await matchService().areMatched(bob.id, alice.id)).toBe(true);
    expect(await matchService().areMatched(alice.id, carol.id)).toBe(false);
  });
});

describe('Messages : validation du contenu', () => {
  it('nettoie les espaces autour du message', () => {
    expect(messageService().validateContent('  bonjour  ')).toBe('bonjour');
  });

  it.each([['', 'vide'], ['   ', 'espaces'], [null, 'nul'], [42, 'non textuel']])(
    'refuse un contenu %s (%s)',
    (contenu) => {
      expect(() => messageService().validateContent(contenu)).toThrow();
    }
  );

  it('refuse au-delà de 2000 caractères', () => {
    expect(() => messageService().validateContent('x'.repeat(2001))).toThrow();
    expect(messageService().validateContent('x'.repeat(2000))).toHaveLength(2000);
  });
});

describe('Découverte : calcul de distance', () => {
  const discover = () => strapi.service('api::discover.discover');

  it('mesure une distance connue (Nantes → Paris ≈ 340 km)', async () => {
    const moi = await createUser({ latitude: 47.218, longitude: -1.553 });
    await createUser({ latitude: 48.857, longitude: 2.352 });

    const { results } = await discover().findCandidates(moi.id, { radius: 500 });
    const paris = results[0];

    expect(paris.distanceKm).toBeGreaterThan(320);
    expect(paris.distanceKm).toBeLessThan(360);
  });

  it('exclut ce qui dépasse le rayon demandé', async () => {
    const moi = await createUser({ latitude: 47.218, longitude: -1.553 });
    await createUser({ latitude: 48.857, longitude: 2.352 });

    const { results } = await discover().findCandidates(moi.id, { radius: 50 });

    expect(results).toHaveLength(0);
  });
});
