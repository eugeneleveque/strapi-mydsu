/**
 * partner-admin router
 *
 * Lets the blog admin list, create and (de)activate partners. Not part of the
 * public API: every action checks the shared secret (src/utils/blog-auth.ts).
 */

const config = { auth: false as const };

export default {
  routes: [
    { method: 'GET', path: '/partner-admin/partners', handler: 'partner-admin.find', config },
    { method: 'POST', path: '/partner-admin/partners', handler: 'partner-admin.create', config },
    { method: 'PUT', path: '/partner-admin/partners/:id/state', handler: 'partner-admin.setState', config },
  ],
};
