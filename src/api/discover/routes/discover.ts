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
    {
      method: 'GET',
      path: '/discover/pools',
      handler: 'discover.pools',
    },
  ],
};
