/**
 * partner-admin service
 *
 * An "active" partner is published right away; a "pending" one stays a draft
 * until activated. Drafts are the reference version, as for the partner login.
 */

import crypto from 'crypto';
import { errors } from '@strapi/utils';

const { NotFoundError, ValidationError } = errors;

const PARTNER_UID = 'api::partner.partner';

const CATEGORIES = [
  'restaurant', 'bar', 'cafe', 'bowling', 'escape_game', 'cinema',
  'museum', 'sport', 'karaoke', 'concert_venue', 'other',
];
const CREATION_STATES = ['pending', 'active'];
const STATES = ['pending', 'active', 'suspended', 'rejected'];

const TEXT_FIELDS = ['name', 'city', 'address', 'contactFirstName', 'contactLastName'];

const toOutput = (partner) => ({
  documentId: partner.documentId,
  name: partner.name ?? null,
  email: partner.email ?? null,
  category: partner.category ?? null,
  city: partner.city ?? null,
  states: partner.states ?? null,
});

const text = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 255) {
    throw new ValidationError(`Le champ "${field}" doit être un texte de 255 caractères au plus.`);
  }
  return value.trim() || null;
};

const findDraft = (where: Record<string, unknown>) =>
  strapi.db.query(PARTNER_UID).findOne({ where: { ...where, publishedAt: { $null: true } } });

export default () => ({
  async find() {
    const partners = await strapi.db.query(PARTNER_UID).findMany({
      where: { publishedAt: { $null: true } },
      orderBy: { name: 'asc' },
      limit: 500,
    });
    return partners.map(toOutput);
  },

  /** Returns the generated password: it cannot be read again afterwards. */
  async create(input: unknown) {
    if (typeof input !== 'object' || input === null) {
      throw new ValidationError('Les données du partenaire sont manquantes.');
    }
    const raw = input as Record<string, unknown>;

    const data: Record<string, unknown> = Object.fromEntries(
      TEXT_FIELDS.map((field) => [field, text(raw[field], field)])
    );
    if (!data.name) {
      throw new ValidationError('Le nom de l’établissement est obligatoire.');
    }

    const email = text(raw.email, 'email')?.toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('Une adresse e-mail valide est obligatoire.');
    }
    // The e-mail is the login: two partners cannot share it.
    if (await findDraft({ email: { $eqi: email } })) {
      throw new ValidationError('Un partenaire utilise déjà cette adresse e-mail.');
    }

    if (!CATEGORIES.includes(raw.category as string)) {
      throw new ValidationError('Catégorie inconnue.');
    }
    if (!CREATION_STATES.includes(raw.states as string)) {
      throw new ValidationError('État inconnu.');
    }

    const postalCode = text(raw.postalCode, 'postalCode');
    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      throw new ValidationError('Le code postal doit comporter 5 chiffres.');
    }

    const password = crypto.randomBytes(12).toString('base64url');
    const partner = await strapi.documents(PARTNER_UID).create({
      data: {
        ...data,
        email,
        password,
        category: raw.category,
        states: raw.states,
        postalCode: postalCode ? Number(postalCode) : null,
        country: 'France',
      } as any,
    });
    if (raw.states === 'active') {
      await strapi.documents(PARTNER_UID).publish({ documentId: partner.documentId });
    }

    return { ...toOutput(await findDraft({ documentId: partner.documentId })), password };
  },

  async setState(documentId: string, states: unknown) {
    if (!STATES.includes(states as string)) {
      throw new ValidationError('État inconnu.');
    }
    if (!(await findDraft({ documentId }))) {
      throw new NotFoundError('Partenaire introuvable.');
    }

    // Both versions, without publishing other edits pending in the draft.
    await strapi.db.query(PARTNER_UID).updateMany({ where: { documentId }, data: { states } });

    const published = await strapi.db.query(PARTNER_UID).findOne({
      where: { documentId, publishedAt: { $notNull: true } },
    });
    if (states === 'active' && !published) {
      await strapi.documents(PARTNER_UID).publish({ documentId });
    }

    return toOutput(await findDraft({ documentId }));
  },
});
