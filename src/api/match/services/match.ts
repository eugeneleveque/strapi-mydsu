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

  async ensureMatch(userA: number, userB: number) {
    const existing = await this.findBetween(userA, userB);
    if (existing) {
      return existing;
    }

    const { user1, user2 } = this.orderPair(userA, userB);
    return strapi.documents(MATCH_UID).create({
      data: { user1, user2 },
      status: 'published',
    });
  },

  /**
   * Scope used by the controllers: matches the user is part of.
   */
  userScope(userId: number) {
    return { $or: [{ user1: { id: userId } }, { user2: { id: userId } }] };
  },
}));
