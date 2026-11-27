/**
 * partner-admin controller
 */

import { requireBlogSecret } from '../../../utils/blog-auth';
import { listConversations, listMessages, requirePartner, sendMessage } from '../../../utils/partner-messages';

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

  async conversations(ctx) {
    requireBlogSecret(ctx);
    ctx.body = { data: await listConversations() };
  },

  async findMessages(ctx) {
    requireBlogSecret(ctx);
    const partner = await requirePartner(ctx.params.id);
    ctx.body = { data: { partner, messages: await listMessages(ctx.params.id, 'team') } };
  },

  async sendMessage(ctx) {
    requireBlogSecret(ctx);
    await requirePartner(ctx.params.id);
    ctx.status = 201;
    ctx.body = { data: await sendMessage(ctx.params.id, 'team', ctx.request.body?.data?.content) };
  },
});
