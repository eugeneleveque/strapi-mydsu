import type { Core } from '@strapi/strapi';

/**
 * Permissions of the Public and Authenticated roles, versioned in the code
 * instead of being configured by hand in the admin panel.
 *
 * For the "managed" prefixes below, the role permissions are set to exactly
 * this list at every startup (missing ones are added, extra ones removed).
 * Other permissions (auth routes, upload...) are only added if missing.
 */

const ROLE_UID = 'plugin::users-permissions.role';
const PERMISSION_UID = 'plugin::users-permissions.permission';

const MANAGED_PREFIXES = [
  'api::activity.',
  'api::booking.',
  'api::like.',
  'api::match.',
  'api::message.',
  'api::partner.',
  'plugin::users-permissions.user.',
];

const crud = (uid: string, actions: string[]) => actions.map((action) => `${uid}.${action}`);

const PERMISSIONS: Record<string, { managed: string[]; ensured: string[] }> = {
  public: {
    managed: [
      ...crud('api::activity.activity', ['find', 'findOne']),
      ...crud('api::partner.partner', ['find', 'findOne']),
    ],
    ensured: crud('plugin::users-permissions.auth', [
      'callback',
      'connect',
      'register',
      'forgotPassword',
      'resetPassword',
      'emailConfirmation',
      'sendEmailConfirmation',
    ]),
  },
  authenticated: {
    managed: [
      ...crud('api::activity.activity', ['find', 'findOne']),
      ...crud('api::partner.partner', ['find', 'findOne']),
      ...crud('api::like.like', ['find', 'findOne', 'create', 'delete']),
      ...crud('api::match.match', ['find', 'findOne', 'delete']),
      ...crud('api::message.message', ['find', 'findOne', 'create', 'update', 'delete']),
      ...crud('api::booking.booking', ['find', 'findOne', 'create', 'update', 'delete']),
      ...crud('plugin::users-permissions.user', ['me', 'find', 'findOne', 'update', 'destroy']),
    ],
    ensured: [
      'plugin::users-permissions.auth.changePassword',
      'plugin::upload.content-api.upload',
    ],
  },
};

const isManaged = (action: string) => MANAGED_PREFIXES.some((prefix) => action.startsWith(prefix));

export const syncPermissions = async (strapi: Core.Strapi) => {
  for (const [roleType, { managed, ensured }] of Object.entries(PERMISSIONS)) {
    const role = await strapi.db.query(ROLE_UID).findOne({ where: { type: roleType } });
    if (!role) {
      strapi.log.warn(`[permissions] Rôle "${roleType}" introuvable.`);
      continue;
    }

    const existing = await strapi.db.query(PERMISSION_UID).findMany({ where: { role: role.id } });
    const existingActions = new Set(existing.map((permission) => permission.action));

    const toRemove = existing.filter((p) => isManaged(p.action) && !managed.includes(p.action));
    if (toRemove.length > 0) {
      await strapi.db.query(PERMISSION_UID).deleteMany({ where: { id: { $in: toRemove.map((p) => p.id) } } });
    }

    const toAdd = [...managed, ...ensured].filter((action) => !existingActions.has(action));
    for (const action of toAdd) {
      await strapi.db.query(PERMISSION_UID).create({ data: { action, role: role.id } });
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      strapi.log.info(`[permissions] ${roleType} : +${toAdd.length} / -${toRemove.length}`);
    }
  }
};
