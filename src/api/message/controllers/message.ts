/**
 * message controller
 *
 * - the sender is always the authenticated user;
 * - a message can only be sent to a matched user;
 * - users only read the messages they sent or received.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { parseId, requireUserId } from '../../../utils/auth';
import { findScopedOrThrow, scopedFind, scopedFindOne } from '../../../utils/scoped-controller';

const { ForbiddenError, ValidationError } = errors;

const MESSAGE_UID = 'api::message.message';
const MAX_LENGTH = 2000;

const userScope = (userId: number) => ({
  $or: [{ sender: { id: userId } }, { recipient: { id: userId } }],
});

export default factories.createCoreController(MESSAGE_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, MESSAGE_UID, userScope(userId));
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    return scopedFindOne(this, ctx, MESSAGE_UID, userScope(userId));
  },

  async create(ctx) {
    const userId = requireUserId(ctx);
    const body = ctx.request.body?.data ?? {};

    const recipientId = parseId(body.recipient, 'recipient');
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      throw new ValidationError('Le message ne peut pas être vide.');
    }
    if (content.length > MAX_LENGTH) {
      throw new ValidationError(`Le message ne peut pas dépasser ${MAX_LENGTH} caractères.`);
    }

    if (!(await strapi.service('api::match.match').areMatched(userId, recipientId))) {
      throw new ForbiddenError('Vous ne pouvez écrire qu’à vos matchs.');
    }

    const data: { content: string; [key: string]: unknown } = {
      content,
      sender: userId,
      recipient: recipientId,
      isRead: false,
      sentAt: new Date(),
    };

    if (body.booking) {
      const booking = await findScopedOrThrow(
        'api::booking.booking',
        String(body.booking?.documentId ?? body.booking),
        strapi.service('api::booking.booking').userScope(userId)
      );
      data.booking = booking.id;
    }

    const message = await strapi.documents(MESSAGE_UID).create({ data });

    const sanitized = await this.sanitizeOutput(message, ctx);
    ctx.status = 201;
    return this.transformResponse(sanitized);
  },

  /**
   * Only the recipient can update a message, and only to mark it as read.
   */
  async update(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(MESSAGE_UID, ctx.params.id, { recipient: { id: userId } });

    const message = await strapi.documents(MESSAGE_UID).update({
      documentId: ctx.params.id,
      data: { isRead: ctx.request.body?.data?.isRead !== false },
    });

    const sanitized = await this.sanitizeOutput(message, ctx);
    return this.transformResponse(sanitized);
  },

  async delete(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(MESSAGE_UID, ctx.params.id, { sender: { id: userId } });
    return super.delete(ctx);
  },
}));
