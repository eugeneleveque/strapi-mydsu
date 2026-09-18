/**
 * like controller
 *
 * The author of a like is always the authenticated user: `fromUser` sent by
 * the client is ignored.
 */

import { factories } from '@strapi/strapi';
import { parseId, requireUserId } from '../../../utils/auth';
import { findScopedOrThrow, scopedFind, scopedFindOne } from '../../../utils/scoped-controller';

const LIKE_UID = 'api::like.like';

export default factories.createCoreController(LIKE_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, LIKE_UID, strapi.service(LIKE_UID).userScope(userId));
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    return scopedFindOne(this, ctx, LIKE_UID, strapi.service(LIKE_UID).userScope(userId));
  },

  async create(ctx) {
    const userId = requireUserId(ctx);
    const toUserId = parseId(ctx.request.body?.data?.toUser, 'toUser');

    const { like, match } = await strapi.service(LIKE_UID).likeUser(userId, toUserId);

    const sanitizedLike = await this.sanitizeOutput(like, ctx);
    ctx.status = 201;
    return this.transformResponse(sanitizedLike, {
      matched: Boolean(match),
      match: match ? { id: match.id, documentId: match.documentId } : null,
    });
  },

  async delete(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(LIKE_UID, ctx.params.id, { fromUser: { id: userId } });
    return super.delete(ctx);
  },
}));
