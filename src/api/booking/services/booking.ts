/**
 * booking service
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ForbiddenError, NotFoundError, ValidationError } = errors;

const BOOKING_UID = 'api::booking.booking';
const ACTIVITY_UID = 'api::activity.activity';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?$/;

// Allowed state changes for the organizer.
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: [],
};

export default factories.createCoreService(BOOKING_UID, ({ strapi }) => ({
  /**
   * Scope used by the controllers: bookings organized by or including the user.
   */
  userScope(userId: number) {
    return { $or: [{ organizer: { id: userId } }, { participants: { id: userId } }] };
  },

  canTransition(from: string, to: string) {
    return (TRANSITIONS[from] ?? []).includes(to);
  },

  validateDateTime({ date, time }: { date?: unknown; time?: unknown }) {
    if (date !== undefined && (typeof date !== 'string' || !DATE_REGEX.test(date) || Number.isNaN(Date.parse(date)))) {
      throw new ValidationError('La date doit être au format AAAA-MM-JJ.');
    }
    if (time !== undefined && (typeof time !== 'string' || !TIME_REGEX.test(time))) {
      throw new ValidationError("L'heure doit être au format HH:mm.");
    }
  },

  /**
   * Strapi stores times as HH:mm:ss.SSS; the app sends HH:mm.
   */
  normalizeTime(time?: string) {
    if (time === undefined) return undefined;
    const [hours, minutes, seconds = '00'] = time.split(':');
    const [secs, millis = '000'] = seconds.split('.');
    return `${hours}:${minutes}:${secs}.${millis.padEnd(3, '0')}`;
  },

  /**
   * Accepts an activity documentId or numeric id; the activity must be published.
   */
  async findActivity(activityRef: unknown) {
    const ref = typeof activityRef === 'object' && activityRef !== null
      ? ((activityRef as any).documentId ?? (activityRef as any).id)
      : activityRef;
    if (ref === undefined || ref === null || ref === '') {
      throw new ValidationError('Le champ "activity" est obligatoire.');
    }

    const filters = /^\d+$/.test(String(ref)) ? { id: Number(ref) } : { documentId: String(ref) };
    const activity = await strapi.documents(ACTIVITY_UID).findFirst({ status: 'published', filters });
    if (!activity) {
      throw new NotFoundError('Activité introuvable.');
    }
    return activity;
  },

  /**
   * Normalizes a participant list and checks that each one is a match of the
   * organizer and that the activity still has room (the organizer takes a seat).
   */
  async validateParticipants(organizerId: number, participants: unknown, activity: any) {
    if (participants !== undefined && !Array.isArray(participants)) {
      throw new ValidationError('Le champ "participants" doit être une liste.');
    }

    const participantIds = [...new Set(((participants ?? []) as any[]).map((p: any) => Number(p?.id ?? p)))]
      .filter((id) => id !== organizerId);

    if (participantIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new ValidationError('Le champ "participants" contient un identifiant invalide.');
    }

    const matchService = strapi.service('api::match.match');
    for (const participantId of participantIds) {
      if (!(await matchService.areMatched(organizerId, participantId))) {
        throw new ForbiddenError('Vous ne pouvez inviter que vos matchs.');
      }
    }

    if (activity?.maxParticipants && participantIds.length + 1 > activity.maxParticipants) {
      throw new ValidationError(`Cette activité est limitée à ${activity.maxParticipants} participants.`);
    }

    return participantIds;
  },

  async createForOrganizer(
    organizerId: number,
    input: { activity?: unknown; participants?: unknown[]; date?: string; time?: string }
  ) {
    this.validateDateTime(input);
    const activity = await this.findActivity(input.activity);
    const participantIds = await this.validateParticipants(organizerId, input.participants, activity);

    return strapi.documents(BOOKING_UID).create({
      data: {
        activity: activity.id,
        activityName: activity.title,
        organizer: organizerId,
        participants: participantIds,
        date: input.date,
        time: this.normalizeTime(input.time),
        state: 'pending',
      },
      status: 'published',
    });
  },
}));
