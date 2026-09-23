/**
 * discover router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/discover',
      handler: 'discover.find',
    },
  ],
};
