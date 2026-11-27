/**
 * discover controller
 */

import { requireUserId } from '../../../utils/auth';
import redis from '../../../redis';
const ALGO_VERSION = process.env.REDIS_ALGO_VERSION || '2.0.0'; 

export default ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    const { results, pagination } = await strapi
      .service('api::discover.discover')
      .findCandidates(userId, ctx.query);

    ctx.body = { data: results, meta: { pagination } };
  },
  async pools(ctx) {
    const userId = requireUserId(ctx); // l'utilisateur connecté, pas un paramètre de l'URL
    const raw = await redis.call('JSON.GET', `${ALGO_VERSION}:pool:${userId}`);

    // Pas encore calculé, ou Redis indisponible.
    ctx.body = JSON.parse(raw);
  },
});
