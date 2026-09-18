import { errors } from '@strapi/utils';

const { ForbiddenError } = errors;

// Fields visible on other users' profiles. Everything else (email, phone,
// position, relations...) is only visible to the owner through /users/me.
const PUBLIC_PROFILE_FIELDS = ['id', 'documentId', 'username', 'bio', 'age', 'city', 'interests', 'gender', 'self_image'];

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

const pick = (object: Record<string, any>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));

const toPublicProfile = (user: any, currentUserId?: number) => {
  if (!user || typeof user !== 'object' || user.id === currentUserId) {
    return user;
  }
  return pick(user, PUBLIC_PROFILE_FIELDS);
};

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
