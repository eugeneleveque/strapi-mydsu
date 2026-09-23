/**
 * discover controller
 */

import { requireUserId } from '../../../utils/auth';

export default ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    const { results, pagination } = await strapi
      .service('api::discover.discover')
      .findCandidates(userId, ctx.query);

    ctx.body = { data: results, meta: { pagination } };
  },
});
