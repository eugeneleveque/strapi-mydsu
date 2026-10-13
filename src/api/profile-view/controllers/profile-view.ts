/**
 * profile-view controller
 *
 * Le spectateur est toujours l'utilisateur authentifié, et chacun ne lit
 * que ses propres consultations.
 */

import { factories } from '@strapi/strapi';
import { requireUserId } from '../../../utils/auth';
import { scopedFind } from '../../../utils/scoped-controller';

const VIEW_UID = 'api::profile-view.profile-view';

export default factories.createCoreController(VIEW_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, VIEW_UID, strapi.service(VIEW_UID).userScope(userId));
  },

  /**
   * Accepte un profil (`viewed`) ou toute une page (`views`).
   */
  async record(ctx) {
    const userId = requireUserId(ctx);
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const service = strapi.service(VIEW_UID);

    if (body.views !== undefined) {
      const { recorded, failures } = await service.recordMany(userId, body.views);
      ctx.status = 201;
      ctx.body = { data: { recorded: recorded.length }, meta: { failures } };
      return;
    }

    const view = await service.record(userId, Number(body.viewed), body.action ?? 'seen');

    ctx.status = 201;
    ctx.body = {
      data: {
        viewed: Number(body.viewed),
        action: view.action,
        seenAt: view.seenAt,
        viewCount: view.viewCount,
      },
    };
  },
}));
