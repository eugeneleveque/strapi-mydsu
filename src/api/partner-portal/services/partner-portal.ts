/**
 * partner-portal service
 *
 * Login of partners and management of their own activities. Activities
 * created here are published right away: partners are vetted by the team
 * before getting their credentials.
 */

import bcrypt from 'bcryptjs';
import { errors } from '@strapi/utils';
import { issuePartnerToken } from '../../../utils/partner-auth';

const { ApplicationError, NotFoundError, UnauthorizedError, ValidationError } = errors;

const PARTNER_UID = 'api::partner.partner';
const ACTIVITY_UID = 'api::activity.activity';

const BLOCKED_STATES = ['suspended', 'rejected'];

const PARTNER_FIELDS = ['name', 'email', 'category', 'city', 'states', 'isVerified'];

const ACTIVITY_FIELDS = [
  'title',
  'description',
  'location',
  'startDate',
  'endDate',
  'minParticipants',
  'maxParticipants',
  'price',
  'createdAt',
  'updatedAt',
];

type ActivityInput = {
  title?: string;
  description?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  price?: number | null;
};

const toPartnerOutput = (partner) => ({
  documentId: partner.documentId,
  ...Object.fromEntries(PARTNER_FIELDS.map((field) => [field, partner[field] ?? null])),
});

const toActivityOutput = (activity) => ({
  documentId: activity.documentId,
  ...Object.fromEntries(ACTIVITY_FIELDS.map((field) => [field, activity[field] ?? null])),
  price: activity.price == null ? null : Number(activity.price),
  bookingsCount: (activity.bookings ?? []).filter((booking) => booking.state !== 'cancelled').length,
});

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

const optionalString = (value: unknown, field: string, maxLength?: number): string | null => {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`Le champ "${field}" doit être un texte.`);
  }
  if (maxLength && value.length > maxLength) {
    throw new ValidationError(`Le champ "${field}" ne doit pas dépasser ${maxLength} caractères.`);
  }
  return value.trim();
};

const optionalDate = (value: unknown, field: string): string | null => {
  if (isBlank(value)) return null;
  const date = new Date(value as string);
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
    throw new ValidationError(`Le champ "${field}" doit être une date valide.`);
  }
  return date.toISOString();
};

const optionalNumber = (value: unknown, field: string, { integer = false, min = 0 } = {}): number | null => {
  if (isBlank(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min) {
    throw new ValidationError(
      `Le champ "${field}" doit être un ${integer ? 'entier' : 'nombre'} supérieur ou égal à ${min}.`
    );
  }
  return number;
};

/**
 * Keeps only the fields a partner may set, and checks them.
 * `current` is the stored activity, used for cross-field checks on update.
 */
const parseActivityInput = (input: unknown, current: ActivityInput = {}): ActivityInput => {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Les données de l’activité sont manquantes.');
  }
  const raw = input as Record<string, unknown>;
  const has = (field: string) => Object.prototype.hasOwnProperty.call(raw, field);

  const data: ActivityInput = {};
  if (has('title')) data.title = optionalString(raw.title, 'title', 255);
  if (has('description')) data.description = optionalString(raw.description, 'description', 5000);
  if (has('location')) data.location = optionalString(raw.location, 'location', 255);
  if (has('startDate')) data.startDate = optionalDate(raw.startDate, 'startDate');
  if (has('endDate')) data.endDate = optionalDate(raw.endDate, 'endDate');
  if (has('minParticipants')) data.minParticipants = optionalNumber(raw.minParticipants, 'minParticipants', { integer: true, min: 1 });
  if (has('maxParticipants')) data.maxParticipants = optionalNumber(raw.maxParticipants, 'maxParticipants', { integer: true, min: 1 });
  if (has('price')) data.price = optionalNumber(raw.price, 'price');

  const merged = { ...current, ...data };

  if (!merged.title) {
    throw new ValidationError('Le titre de l’activité est obligatoire.');
  }
  if (merged.startDate && merged.endDate && new Date(merged.endDate) < new Date(merged.startDate)) {
    throw new ValidationError('La date de fin doit être postérieure à la date de début.');
  }
  if (merged.minParticipants && merged.maxParticipants && merged.minParticipants > merged.maxParticipants) {
    throw new ValidationError('Le minimum de participants ne peut pas dépasser le maximum.');
  }

  return data;
};

export default () => ({
  async login(email: string, password: string) {
    const partner = await strapi.db.query(PARTNER_UID).findOne({
      where: { email: { $eqi: email }, publishedAt: { $null: true } },
    });

    // Same error whatever the reason, so the endpoint does not reveal which emails exist.
    const valid = partner?.password && (await bcrypt.compare(password, partner.password));
    if (!valid) {
      throw new UnauthorizedError('Email ou mot de passe incorrect.');
    }
    if (BLOCKED_STATES.includes(partner.states)) {
      throw new UnauthorizedError('Ce compte partenaire est désactivé. Contactez l’équipe Bondiz.');
    }

    return { token: issuePartnerToken(partner.documentId), partner: toPartnerOutput(partner) };
  },

  async getPartner(partnerDocumentId: string) {
    const partner = await strapi.documents(PARTNER_UID).findOne({ documentId: partnerDocumentId });
    if (!partner || BLOCKED_STATES.includes(partner.states)) {
      throw new UnauthorizedError('Ce compte partenaire est désactivé ou n’existe plus.');
    }
    return toPartnerOutput(partner);
  },

  async findActivities(partnerDocumentId: string) {
    await this.getPartner(partnerDocumentId);

    const activities = await strapi.documents(ACTIVITY_UID).findMany({
      filters: { partner: { documentId: partnerDocumentId } },
      status: 'published',
      sort: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      populate: { bookings: { fields: ['state'] } },
      limit: 500,
    });
    return activities.map(toActivityOutput);
  },

  async findOwnActivity(partnerDocumentId: string, activityDocumentId: string) {
    await this.getPartner(partnerDocumentId);

    const activity = await strapi.documents(ACTIVITY_UID).findFirst({
      filters: { documentId: activityDocumentId, partner: { documentId: partnerDocumentId } },
      status: 'published',
      populate: { bookings: { fields: ['state'] } },
    });
    if (!activity) {
      throw new NotFoundError('Activité introuvable.');
    }
    return activity;
  },

  async findActivity(partnerDocumentId: string, activityDocumentId: string) {
    return toActivityOutput(await this.findOwnActivity(partnerDocumentId, activityDocumentId));
  },

  async createActivity(partnerDocumentId: string, input: unknown) {
    await this.getPartner(partnerDocumentId);
    const data = parseActivityInput(input);

    const activity = await strapi.documents(ACTIVITY_UID).create({
      data: { ...data, partner: partnerDocumentId } as any,
      status: 'published',
    });
    return toActivityOutput(activity);
  },

  async updateActivity(partnerDocumentId: string, activityDocumentId: string, input: unknown) {
    const current = await this.findOwnActivity(partnerDocumentId, activityDocumentId);
    const data = parseActivityInput(input, current as ActivityInput);

    const activity = await strapi.documents(ACTIVITY_UID).update({
      documentId: activityDocumentId,
      data: data as any,
      status: 'published',
      populate: { bookings: { fields: ['state'] } },
    });
    return toActivityOutput(activity);
  },

  async deleteActivity(partnerDocumentId: string, activityDocumentId: string) {
    const activity = await this.findOwnActivity(partnerDocumentId, activityDocumentId);

    if (toActivityOutput(activity).bookingsCount > 0) {
      throw new ApplicationError(
        'Cette activité a des réservations en cours : annulez-les ou contactez l’équipe Bondiz avant de la supprimer.'
      );
    }

    await strapi.documents(ACTIVITY_UID).delete({ documentId: activityDocumentId });
  },
});
