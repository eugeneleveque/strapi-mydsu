import { requireUserId } from '../../../utils/auth';

const service = () => strapi.service('api::favorite.favorite');

export default {
  async find(ctx) {
    const userId = requireUserId(ctx);
    ctx.body = { data: await service().listForUser(userId) };
  },

  async add(ctx) {
    const userId = requireUserId(ctx);
    await service().add(userId, ctx.params.activityId);
    ctx.body = { data: await service().listForUser(userId) };
  },

  async remove(ctx) {
    const userId = requireUserId(ctx);
    await service().remove(userId, ctx.params.activityId);
    ctx.body = { data: await service().listForUser(userId) };
  },
};
