/**
 * push-subscription router
 *
 * Only custom routes: the subscriptions are never listed through the API.
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/push/public-key',
      handler: 'push-subscription.publicKey',
    },
    {
      method: 'POST',
      path: '/push/subscriptions',
      handler: 'push-subscription.subscribe',
    },
    {
      // POST rather than DELETE: the body parser ignores DELETE bodies.
      method: 'POST',
      path: '/push/subscriptions/unsubscribe',
      handler: 'push-subscription.unsubscribe',
    },
  ],
};
