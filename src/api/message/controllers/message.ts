/**
 * message controller
 *
 * - the sender is always the authenticated user;
 * - a message can only be sent to a matched user;
 * - users only read the messages they sent or received.
 */

import { factories } from '@strapi/strapi';
import { parseId, requireUserId } from '../../../utils/auth';
import { findScopedOrThrow, scopedFind, scopedFindOne } from '../../../utils/scoped-controller';

const MESSAGE_UID = 'api::message.message';

export default factories.createCoreController(MESSAGE_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, MESSAGE_UID, strapi.service(MESSAGE_UID).userScope(userId));
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    return scopedFindOne(this, ctx, MESSAGE_UID, strapi.service(MESSAGE_UID).userScope(userId));
  },

  async create(ctx) {
    const userId = requireUserId(ctx);
    const body = ctx.request.body?.data ?? {};
    const recipientId = parseId(body.recipient, 'recipient');

    let bookingId: number | undefined;
    if (body.booking) {
      const booking = await findScopedOrThrow(
        'api::booking.booking',
        String(body.booking?.documentId ?? body.booking),
        strapi.service('api::booking.booking').userScope(userId)
      );
      bookingId = booking.id;
    }

    const message = await strapi.service(MESSAGE_UID).send(userId, recipientId, body.content, bookingId);

    const sanitized = await this.sanitizeOutput(message, ctx);
    ctx.status = 201;
    return this.transformResponse(sanitized);
  },

  /**
   * Only the recipient can update a message, and only to mark it as read.
   */
  async update(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(MESSAGE_UID, ctx.params.id, {
      $and: [{ recipient: { id: userId } }, strapi.service(MESSAGE_UID).notDeleted()],
    });

    const message = await strapi.documents(MESSAGE_UID).update({
      documentId: ctx.params.id,
      data: { isRead: ctx.request.body?.data?.isRead !== false },
    });

    const sanitized = await this.sanitizeOutput(message, ctx);
    return this.transformResponse(sanitized);
  },

  /**
   * The sender archives their own message: it disappears from the API
   * but stays in database for moderation.
   */
  async delete(ctx) {
    const userId = requireUserId(ctx);
    const messageService = strapi.service(MESSAGE_UID);
    const message = await findScopedOrThrow(MESSAGE_UID, ctx.params.id, {
      $and: [{ sender: { id: userId } }, messageService.notDeleted()],
    });

    await messageService.archive({ id: message.id }, 'sender');

    ctx.status = 204;
  },
}));
