/**
 * match controller
 *
 * Matches are created by the server when two likes are reciprocal:
 * users can only read their own matches or delete one (unmatch).
 */

import { factories } from '@strapi/strapi';
import { requireUserId } from '../../../utils/auth';
import { findScopedOrThrow, scopedFind, scopedFindOne } from '../../../utils/scoped-controller';

const MATCH_UID = 'api::match.match';

export default factories.createCoreController(MATCH_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, MATCH_UID, strapi.service(MATCH_UID).userScope(userId));
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    return scopedFindOne(this, ctx, MATCH_UID, strapi.service(MATCH_UID).userScope(userId));
  },

  async delete(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(MATCH_UID, ctx.params.id, strapi.service(MATCH_UID).userScope(userId));
    return super.delete(ctx);
  },
}));
