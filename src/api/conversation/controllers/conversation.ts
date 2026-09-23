/**
 * conversation controller
 */

import { requireUserId } from '../../../utils/auth';
import { toPublicProfile } from '../../../utils/public-profile';

const CONVERSATION_UID = 'api::conversation.conversation';
const MESSAGE_UID = 'api::message.message';

export default ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    const { results, pagination, unreadTotal } = await strapi
      .service(CONVERSATION_UID)
      .listForUser(userId, ctx.query);

    ctx.body = { data: results, meta: { pagination, unreadTotal } };
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    const { match, otherUser } = await strapi
      .service(CONVERSATION_UID)
      .getConversation(userId, ctx.params.matchId);

    const messageService = strapi.service(MESSAGE_UID);
    ctx.body = {
      data: {
        matchId: match.id,
        matchDocumentId: match.documentId,
        otherUser: toPublicProfile(otherUser),
        unreadCount: await messageService.countUnreadFrom(userId, otherUser.id),
      },
    };
  },

  async messages(ctx) {
    const userId = requireUserId(ctx);
    const conversationService = strapi.service(CONVERSATION_UID);
    const { otherUser } = await conversationService.getConversation(userId, ctx.params.matchId);

    const { results, pagination } = await conversationService.listMessages(userId, otherUser.id, ctx.query);
    ctx.body = { data: results, meta: { pagination } };
  },

  async send(ctx) {
    const userId = requireUserId(ctx);
    const { otherUser } = await strapi
      .service(CONVERSATION_UID)
      .getConversation(userId, ctx.params.matchId);

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const message = await strapi.service(MESSAGE_UID).send(userId, otherUser.id, body.content);

    ctx.status = 201;
    ctx.body = {
      data: {
        id: message.id,
        documentId: message.documentId,
        content: message.content,
        sentAt: message.sentAt,
        isRead: message.isRead,
        isMine: true,
      },
    };
  },

  /**
   * Marks every message received in this conversation as read.
   */
  async read(ctx) {
    const userId = requireUserId(ctx);
    const { otherUser } = await strapi
      .service(CONVERSATION_UID)
      .getConversation(userId, ctx.params.matchId);

    const markedRead = await strapi.service(MESSAGE_UID).markConversationRead(userId, otherUser.id);
    ctx.body = { data: { markedRead } };
  },
});
