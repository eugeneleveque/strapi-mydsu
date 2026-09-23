/**
 * booking controller
 *
 * - the organizer is always the authenticated user;
 * - participants must be matches of the organizer;
 * - only the organizer can update or delete a booking;
 * - a participant can leave a booking.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { requireUserId } from '../../../utils/auth';
import { findScopedOrThrow, scopedFind, scopedFindOne } from '../../../utils/scoped-controller';

const { ForbiddenError, ValidationError } = errors;

const BOOKING_UID = 'api::booking.booking';

export default factories.createCoreController(BOOKING_UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = requireUserId(ctx);
    return scopedFind(this, ctx, BOOKING_UID, strapi.service(BOOKING_UID).userScope(userId));
  },

  async findOne(ctx) {
    const userId = requireUserId(ctx);
    return scopedFindOne(this, ctx, BOOKING_UID, strapi.service(BOOKING_UID).userScope(userId));
  },

  async create(ctx) {
    const userId = requireUserId(ctx);
    const { activity, participants, date, time } = ctx.request.body?.data ?? {};

    const booking = await strapi
      .service(BOOKING_UID)
      .createForOrganizer(userId, { activity, participants, date, time });

    const sanitized = await this.sanitizeOutput(booking, ctx);
    ctx.status = 201;
    return this.transformResponse(sanitized);
  },

  /**
   * The organizer can change the date, the time, the state or the guest list.
   */
  async update(ctx) {
    const userId = requireUserId(ctx);
    const bookingService = strapi.service(BOOKING_UID);
    const booking = await findScopedOrThrow(BOOKING_UID, ctx.params.id, { organizer: { id: userId } }, {
      populate: { activity: true },
    });

    const { date, time, state, participants } = ctx.request.body?.data ?? {};
    bookingService.validateDateTime({ date, time });

    const data: Record<string, any> = {};
    if (date !== undefined) data.date = date;
    if (time !== undefined) data.time = bookingService.normalizeTime(time);

    if (participants !== undefined) {
      data.participants = await bookingService.validateParticipants(userId, participants, booking.activity);
    }

    if (state !== undefined && state !== booking.state) {
      if (!bookingService.canTransition(booking.state ?? 'pending', state)) {
        throw new ValidationError(`Impossible de passer une réservation de "${booking.state}" à "${state}".`);
      }
      data.state = state;
    }

    const updated = await strapi.documents(BOOKING_UID).update({
      documentId: ctx.params.id,
      data,
      status: 'published',
    });

    const sanitized = await this.sanitizeOutput(updated, ctx);
    return this.transformResponse(sanitized);
  },

  /**
   * A participant leaves the booking. The organizer has to cancel it instead.
   */
  async leave(ctx) {
    const userId = requireUserId(ctx);
    const booking = await findScopedOrThrow(
      BOOKING_UID,
      ctx.params.id,
      strapi.service(BOOKING_UID).userScope(userId),
      { populate: { participants: true, organizer: true } }
    );

    if (booking.organizer?.id === userId) {
      throw new ForbiddenError('En tant qu’organisateur, annulez la réservation au lieu de la quitter.');
    }

    const remaining = (booking.participants ?? [])
      .map((participant: any) => participant.id)
      .filter((id: number) => id !== userId);

    const updated = await strapi.documents(BOOKING_UID).update({
      documentId: ctx.params.id,
      data: { participants: remaining },
      status: 'published',
    });

    const sanitized = await this.sanitizeOutput(updated, ctx);
    return this.transformResponse(sanitized);
  },

  async delete(ctx) {
    const userId = requireUserId(ctx);
    await findScopedOrThrow(BOOKING_UID, ctx.params.id, { organizer: { id: userId } });
    return super.delete(ctx);
  },
}));
