/**
 * profile-view router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/profile-views',
      handler: 'profile-view.find',
    },
    {
      method: 'POST',
      path: '/profile-views',
      handler: 'profile-view.record',
    },
  ],
};
