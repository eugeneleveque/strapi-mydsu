/**
 * conversation router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/conversations',
      handler: 'conversation.find',
    },
    {
      method: 'GET',
      path: '/conversations/:matchId',
      handler: 'conversation.findOne',
    },
    {
      method: 'GET',
      path: '/conversations/:matchId/messages',
      handler: 'conversation.messages',
    },
    {
      method: 'POST',
      path: '/conversations/:matchId/messages',
      handler: 'conversation.send',
    },
    {
      method: 'POST',
      path: '/conversations/:matchId/read',
      handler: 'conversation.read',
    },
  ],
};
