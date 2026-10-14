/**
 * push-subscription controller
 *
 * The owner of a subscription is always the authenticated user.
 */

import { requireUserId } from '../../../utils/auth';

const PUSH_UID = 'api::push-subscription.push-subscription';

export default ({ strapi }) => ({
  /**
   * VAPID public key the browser needs to subscribe.
   * `null` when push notifications are not configured on this server.
   */
  async publicKey(ctx) {
    requireUserId(ctx);
    ctx.body = { data: { publicKey: strapi.service(PUSH_UID).publicKey() } };
  },

  async subscribe(ctx) {
    const userId = requireUserId(ctx);
    const pushService = strapi.service(PUSH_UID);

    if (!pushService.isEnabled()) {
      ctx.status = 503;
      ctx.body = {
        data: null,
        error: {
          status: 503,
          name: 'ServiceUnavailableError',
          message: 'Les notifications ne sont pas configurées sur ce serveur.',
        },
      };
      return;
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    await pushService.subscribe(userId, body);

    ctx.status = 201;
    ctx.body = { data: { subscribed: true } };
  },

  async unsubscribe(ctx) {
    const userId = requireUserId(ctx);
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};

    const removed = await strapi.service(PUSH_UID).unsubscribe(userId, body.endpoint);
    ctx.body = { data: { removed } };
  },
});
