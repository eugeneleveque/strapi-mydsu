/**
 * like service
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ValidationError, NotFoundError } = errors;

const LIKE_UID = 'api::like.like';
const USER_UID = 'plugin::users-permissions.user';

export default factories.createCoreService(LIKE_UID, ({ strapi }) => ({
  /**
   * Creates a like from `fromUserId` to `toUserId` (idempotent) and creates
   * the match when the like is reciprocal.
   */
  async likeUser(fromUserId: number, toUserId: number) {
    if (fromUserId === toUserId) {
      throw new ValidationError('Un utilisateur ne peut pas se liker lui-même.');
    }

    const target = await strapi.db.query(USER_UID).findOne({ where: { id: toUserId }, select: ['id', 'blocked'] });
    if (!target || target.blocked) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    let like = await this.findLike(fromUserId, toUserId);
    if (!like) {
      like = await strapi.documents(LIKE_UID).create({
        data: { fromUser: fromUserId, toUser: toUserId, state: 'pending' },
        status: 'published',
      });
    }

    const reverseLike = await this.findLike(toUserId, fromUserId);
    if (!reverseLike) {
      return { like, match: null };
    }

    const match = await strapi.service('api::match.match').ensureMatch(fromUserId, toUserId);

    for (const { documentId, state } of [like, reverseLike]) {
      if (state !== 'accepted') {
        await strapi.documents(LIKE_UID).update({ documentId, data: { state: 'accepted' }, status: 'published' });
      }
    }
    like = { ...like, state: 'accepted' };

    return { like, match };
  },

  async findLike(fromUserId: number, toUserId: number) {
    return strapi.documents(LIKE_UID).findFirst({
      status: 'published',
      filters: { fromUser: { id: fromUserId }, toUser: { id: toUserId } },
    });
  },

  /**
   * Scope used by the controllers: likes sent or received by the user.
   */
  userScope(userId: number) {
    return { $or: [{ fromUser: { id: userId } }, { toUser: { id: userId } }] };
  },
}));
