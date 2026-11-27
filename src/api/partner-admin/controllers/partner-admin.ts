/**
 * partner-admin controller
 */

import { requireBlogSecret } from '../../../utils/blog-auth';

const service = () => strapi.service('api::partner-admin.partner-admin');

export default () => ({
  async find(ctx) {
    requireBlogSecret(ctx);
    ctx.body = { data: await service().find() };
  },

  async create(ctx) {
    requireBlogSecret(ctx);
    const created = await service().create(ctx.request.body?.data);
    ctx.status = 201;
    ctx.body = { data: created };
  },

  async setState(ctx) {
    requireBlogSecret(ctx);
    ctx.body = { data: await service().setState(ctx.params.id, ctx.request.body?.data?.states) };
  },
});
