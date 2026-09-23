/**
 * conversation service
 *
 * A conversation is a match: two users who liked each other. It exists only
 * as long as the match does — unmatching closes the chat.
 */

import { errors } from '@strapi/utils';
import { toPublicProfile } from '../../../utils/public-profile';

const { ForbiddenError, NotFoundError, ValidationError } = errors;

const MATCH_UID = 'api::match.match';
const MESSAGE_UID = 'api::message.message';

const MAX_PAGE_SIZE = 100;
const DEFAULT_CONVERSATION_PAGE_SIZE = 20;
const DEFAULT_MESSAGE_PAGE_SIZE = 50;

const toPositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (value === undefined || value === '' || Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
};

export default ({ strapi }) => ({
  /**
   * Loads a match the user belongs to, by documentId or numeric id,
   * and returns the other user.
   */
  async getConversation(userId: number, matchRef: string) {
    const isNumeric = /^\d+$/.test(String(matchRef));
    const match = await strapi.db.query(MATCH_UID).findOne({
      where: {
        ...(isNumeric ? { id: Number(matchRef) } : { documentId: String(matchRef) }),
        publishedAt: { $notNull: true },
      },
      populate: { user1: { populate: { self_image: true } }, user2: { populate: { self_image: true } } },
    });

    if (!match) {
      throw new NotFoundError('Conversation introuvable.');
    }

    const user1Id = match.user1?.id;
    const user2Id = match.user2?.id;
    if (user1Id !== userId && user2Id !== userId) {
      throw new ForbiddenError('Cette conversation ne vous appartient pas.');
    }

    const otherUser = user1Id === userId ? match.user2 : match.user1;
    if (!otherUser) {
      throw new NotFoundError('L’autre participant n’existe plus.');
    }

    return { match, otherUser };
  },

  /**
   * Conversation list: other user, last message and unread count,
   * most recent activity first.
   */
  async listForUser(userId: number, query: Record<string, any> = {}) {
    const page = toPositiveInt(query.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = toPositiveInt(query.pageSize, DEFAULT_CONVERSATION_PAGE_SIZE, MAX_PAGE_SIZE);

    const where = {
      $or: [{ user1: { id: userId } }, { user2: { id: userId } }],
      publishedAt: { $notNull: true },
    };

    const [matches, total] = await Promise.all([
      strapi.db.query(MATCH_UID).findMany({
        where,
        populate: { user1: { populate: { self_image: true } }, user2: { populate: { self_image: true } } },
        orderBy: { id: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      strapi.db.query(MATCH_UID).count({ where }),
    ]);

    const messageService = strapi.service(MESSAGE_UID);

    const conversations = await Promise.all(
      matches.map(async (match) => {
        const otherUser = match.user1?.id === userId ? match.user2 : match.user1;
        if (!otherUser) return null;

        const [lastMessage, unreadCount] = await Promise.all([
          messageService.lastMessageWith(userId, otherUser.id),
          messageService.countUnreadFrom(userId, otherUser.id),
        ]);

        return {
          matchId: match.id,
          matchDocumentId: match.documentId,
          otherUser: toPublicProfile(otherUser),
          unreadCount,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                sentAt: lastMessage.sentAt ?? lastMessage.createdAt,
                isMine: lastMessage.sender?.id === userId,
                isRead: lastMessage.isRead,
              }
            : null,
          lastActivityAt: lastMessage?.sentAt ?? lastMessage?.createdAt ?? match.createdAt,
        };
      })
    );

    const results = conversations
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    return {
      results,
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      unreadTotal: results.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    };
  },

  /**
   * Message history of a conversation, oldest first.
   * `since` (ISO date) only returns newer messages, for polling.
   */
  async listMessages(userId: number, otherUserId: number, query: Record<string, any> = {}) {
    const page = toPositiveInt(query.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = toPositiveInt(query.pageSize, DEFAULT_MESSAGE_PAGE_SIZE, MAX_PAGE_SIZE);

    const where: Record<string, any> = {
      // Archived messages (unmatch, deleted by their sender) stay hidden.
      deletedAt: { $null: true },
      $or: [
        { sender: { id: userId }, recipient: { id: otherUserId } },
        { sender: { id: otherUserId }, recipient: { id: userId } },
      ],
    };

    if (query.since) {
      const since = new Date(query.since);
      if (Number.isNaN(since.getTime())) {
        throw new ValidationError('Le paramètre "since" doit être une date ISO.');
      }
      where.sentAt = { $gt: since };
    }

    const [messages, total] = await Promise.all([
      strapi.db.query(MESSAGE_UID).findMany({
        where,
        populate: { sender: { select: ['id'] }, recipient: { select: ['id'] } },
        // Newest first so page 1 is the end of the conversation, then reversed below.
        orderBy: { id: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      strapi.db.query(MESSAGE_UID).count({ where }),
    ]);

    const results = messages
      .map((message) => ({
        id: message.id,
        documentId: message.documentId,
        content: message.content,
        sentAt: message.sentAt ?? message.createdAt,
        isRead: message.isRead,
        isMine: message.sender?.id === userId,
        senderId: message.sender?.id,
        recipientId: message.recipient?.id,
      }))
      .reverse();

    return {
      results,
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  },
});
