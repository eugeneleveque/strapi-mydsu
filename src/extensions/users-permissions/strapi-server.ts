import { errors } from '@strapi/utils';
import { PUBLIC_PROFILE_FIELDS, pick, toPublicProfile as toPublic } from '../../utils/public-profile';

const { ForbiddenError } = errors;

// Fields a user can never change through PUT /users/:id.
const PROTECTED_FIELDS = [
  'role',
  'provider',
  'confirmed',
  'blocked',
  'password',
  'resetPasswordToken',
  'confirmationToken',
  'organizedBookings',
  'participatedBookings',
  'like_user',
  'likes',
  'matches',
  'matches2',
  'sentMessages',
  'receivedMessages',
];

const toPublicProfile = (user: any, currentUserId?: number) =>
  user && typeof user === 'object' && user.id === currentUserId ? user : toPublic(user);

const isSelf = (ctx) => String(ctx.state?.user?.id) === String(ctx.params.id);

export default (plugin) => {
  const userController = plugin.controllers.user;
  const { find, findOne, update, destroy } = userController;

  userController.find = async (ctx) => {
    // Only allow filtering on public fields, and never list blocked accounts.
    const filters = ctx.query?.filters && typeof ctx.query.filters === 'object'
      ? pick(ctx.query.filters, PUBLIC_PROFILE_FIELDS)
      : {};
    ctx.query = {
      ...ctx.query,
      filters: { $and: [filters, { $or: [{ blocked: false }, { blocked: { $null: true } }] }] },
    };

    await find(ctx);

    if (Array.isArray(ctx.body)) {
      ctx.body = ctx.body.map((user) => toPublicProfile(user, ctx.state?.user?.id));
    }
  };

  userController.findOne = async (ctx) => {
    await findOne(ctx);
    ctx.body = toPublicProfile(ctx.body, ctx.state?.user?.id);
  };

  userController.update = async (ctx) => {
    if (!isSelf(ctx)) {
      throw new ForbiddenError('Vous ne pouvez modifier que votre propre profil.');
    }
    for (const field of PROTECTED_FIELDS) {
      delete ctx.request.body?.[field];
    }
    return update(ctx);
  };

  userController.destroy = async (ctx) => {
    if (!isSelf(ctx)) {
      throw new ForbiddenError('Vous ne pouvez supprimer que votre propre compte.');
    }
    return destroy(ctx);
  };

  return plugin;
};
