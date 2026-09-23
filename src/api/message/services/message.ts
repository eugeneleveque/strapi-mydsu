import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ForbiddenError, ValidationError } = errors;

const MESSAGE_UID = 'api::message.message';

const MAX_LENGTH = 2000;

export default factories.createCoreService(MESSAGE_UID, ({ strapi }) => ({
  /**
   * Archived messages (soft delete) stay in database for moderation,
   * but are never returned by the API.
   */
  notDeleted() {
    return { deletedAt: { $null: true } };
  },

  /**
   * Scope used by the controllers: live messages sent or received by the user.
   */
  userScope(userId: number) {
    return {
      $and: [
        { $or: [{ sender: { id: userId } }, { recipient: { id: userId } }] },
        this.notDeleted(),
      ],
    };
  },

  /**
   * Soft delete: keeps the row, hides it from the API.
   */
  async archive(where: Record<string, any>, reason: 'unmatch' | 'sender') {
    const messages = await strapi.db.query(MESSAGE_UID).findMany({
      where: { $and: [where, { deletedAt: { $null: true } }] },
      select: ['id'],
    });

    if (messages.length === 0) return 0;

    await strapi.db.query(MESSAGE_UID).updateMany({
      where: { id: { $in: messages.map((message) => message.id) } },
      data: { deletedAt: new Date(), deletedReason: reason },
    });

    return messages.length;
  },

  validateContent(content: unknown) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      throw new ValidationError('Le message ne peut pas être vide.');
    }
    if (text.length > MAX_LENGTH) {
      throw new ValidationError(`Le message ne peut pas dépasser ${MAX_LENGTH} caractères.`);
    }
    return text;
  },

  /**
   * Sends a message. Both users must be matched.
   */
  async send(senderId: number, recipientId: number, content: unknown, bookingId?: number) {
    const text = this.validateContent(content);

    if (!(await strapi.service('api::match.match').areMatched(senderId, recipientId))) {
      throw new ForbiddenError('Vous ne pouvez écrire qu’à vos matchs.');
    }

    return strapi.documents(MESSAGE_UID).create({
      data: {
        content: text,
        sender: senderId,
        recipient: recipientId,
        isRead: false,
        sentAt: new Date(),
        ...(bookingId ? { booking: bookingId } : {}),
      },
    });
  },

  /**
   * Marks every message received from `otherUserId` as read.
   */
  async markConversationRead(userId: number, otherUserId: number) {
    const unread = await strapi.db.query(MESSAGE_UID).findMany({
      where: { sender: { id: otherUserId }, recipient: { id: userId }, isRead: false, deletedAt: { $null: true } },
      select: ['id'],
    });

    if (unread.length > 0) {
      await strapi.db.query(MESSAGE_UID).updateMany({
        where: { id: { $in: unread.map((message) => message.id) } },
        data: { isRead: true },
      });
    }

    return unread.length;
  },

  async countUnreadFrom(userId: number, otherUserId: number) {
    return strapi.db.query(MESSAGE_UID).count({
      where: { sender: { id: otherUserId }, recipient: { id: userId }, isRead: false, deletedAt: { $null: true } },
    });
  },

  /**
   * Last message exchanged with `otherUserId`, whoever sent it.
   */
  async lastMessageWith(userId: number, otherUserId: number) {
    const [message] = await strapi.db.query(MESSAGE_UID).findMany({
      where: {
        deletedAt: { $null: true },
        $or: [
          { sender: { id: userId }, recipient: { id: otherUserId } },
          { sender: { id: otherUserId }, recipient: { id: userId } },
        ],
      },
      populate: { sender: { select: ['id'] } },
      orderBy: { id: 'desc' },
      limit: 1,
    });
    return message ?? null;
  },
}));
