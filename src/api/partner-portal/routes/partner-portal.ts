/**
 * partner-portal router
 *
 * Space where partners log in (from the blog) and manage their own activities.
 * These routes do not use users-permissions: partners are not app users, they
 * authenticate with their own token (see src/utils/partner-auth.ts).
 */

const config = { auth: false as const };

export default {
  routes: [
    {
      method: 'POST',
      path: '/partner-portal/login',
      handler: 'partner-portal.login',
      config: { ...config, middlewares: ['plugin::users-permissions.rateLimit'] },
    },
    {
      method: 'GET',
      path: '/partner-portal/me',
      handler: 'partner-portal.me',
      config,
    },
    {
      method: 'GET',
      path: '/partner-portal/activities',
      handler: 'partner-portal.findActivities',
      config,
    },
    {
      method: 'GET',
      path: '/partner-portal/activities/:id',
      handler: 'partner-portal.findActivity',
      config,
    },
    {
      method: 'POST',
      path: '/partner-portal/activities',
      handler: 'partner-portal.createActivity',
      config,
    },
    {
      method: 'PUT',
      path: '/partner-portal/activities/:id',
      handler: 'partner-portal.updateActivity',
      config,
    },
    {
      method: 'DELETE',
      path: '/partner-portal/activities/:id',
      handler: 'partner-portal.deleteActivity',
      config,
    },
  ],
};
