/**
 * match service
 */

import { factories } from '@strapi/strapi';

const MATCH_UID = 'api::match.match';

export default factories.createCoreService(MATCH_UID, ({ strapi }) => ({
  /**
   * A match is always stored with user1 < user2 so a pair is unique.
   */
  orderPair(userA: number, userB: number) {
    return { user1: Math.min(userA, userB), user2: Math.max(userA, userB) };
  },

  async findBetween(userA: number, userB: number) {
    const { user1, user2 } = this.orderPair(userA, userB);
    return strapi.documents(MATCH_UID).findFirst({
      status: 'published',
      filters: { user1: { id: user1 }, user2: { id: user2 } },
    });
  },

  async areMatched(userA: number, userB: number) {
    return Boolean(await this.findBetween(userA, userB));
  },

  /**
   * Le "vérifier puis créer" est fait dans une transaction : sans ça, deux
   * likes réciproques envoyés au même instant pourraient chacun constater
   * l'absence de match et créer deux matchs (donc deux conversations) pour
   * la même paire. La transaction sérialise l'écriture (SQLite verrouille
   * le fichier le temps de la transaction) et empêche ce doublon.
   */
  async ensureMatch(userA: number, userB: number) {
    let match;
    await strapi.db.transaction(async () => {
      const existing = await this.findBetween(userA, userB);
      if (existing) {
        match = existing;
        return;
      }

      const { user1, user2 } = this.orderPair(userA, userB);
      match = await strapi.documents(MATCH_UID).create({
        data: { user1, user2 },
        status: 'published',
      });
    });
    return match;
  },

  /**
   * Scope used by the controllers: matches the user is part of.
   */
  userScope(userId: number) {
    return { $or: [{ user1: { id: userId } }, { user2: { id: userId } }] };
  },
}));
