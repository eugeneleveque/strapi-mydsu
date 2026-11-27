/**
 * The public page of a partner, edited by the partner itself: contact details,
 * description, opening hours and photos. Name, category and e-mail (the login)
 * stay in the hands of the team.
 *
 * Changes are written to both the draft and the published versions, without
 * publishing other edits the team may have pending in the draft.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { errors } from '@strapi/utils';

const { NotFoundError, ValidationError } = errors;

const PARTNER_UID = 'api::partner.partner';

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const MAX_PHOTOS = 8;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const versions = (documentId: string) =>
  strapi.db.query(PARTNER_UID).findMany({ where: { documentId }, populate: { coverImage: true } });

const draft = async (documentId: string) => {
  const partner = (await versions(documentId)).find((row) => !row.publishedAt);
  if (!partner) {
    throw new NotFoundError('Partenaire introuvable.');
  }
  return partner;
};

/** The integer column drops the leading zero of French numbers. */
const formatPhone = (phone: unknown): string | null => {
  if (!phone) return null;
  const digits = String(phone);
  return digits.length === 9 ? `0${digits}` : digits;
};

export const getProfile = async (documentId: string) => {
  const partner = await draft(documentId);

  return {
    documentId,
    name: partner.name ?? null,
    email: partner.email ?? null,
    category: partner.category ?? null,
    states: partner.states ?? null,
    address: partner.address ?? null,
    postalCode: partner.postalCode ? String(partner.postalCode).padStart(5, '0') : null,
    city: partner.city ?? null,
    phone: formatPhone(partner.phone),
    website: partner.website ?? null,
    description: partner.description ?? null,
    openingHours: Object.fromEntries(DAYS.map((day) => [day, partner.openingHours?.[day] ?? null])),
    photos: (partner.coverImage ?? []).map((file) => ({ id: file.id, url: file.url })),
  };
};

const text = (value: unknown, field: string, maxLength: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ValidationError(`Le champ "${field}" doit être un texte de ${maxLength} caractères au plus.`);
  }
  return value.trim() || null;
};

/** Keeps only the fields a partner may set, and checks the ones sent. */
const parseProfile = (input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Les données de la fiche sont manquantes.');
  }
  const raw = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const has = (field: string) => Object.prototype.hasOwnProperty.call(raw, field);

  if (has('address')) data.address = text(raw.address, 'address', 255);
  if (has('city')) data.city = text(raw.city, 'city', 255);
  if (has('description')) data.description = text(raw.description, 'description', 3000);

  if (has('postalCode')) {
    const postalCode = text(raw.postalCode, 'postalCode', 5);
    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      throw new ValidationError('Le code postal doit comporter 5 chiffres.');
    }
    data.postalCode = postalCode ? Number(postalCode) : null;
  }

  if (has('phone')) {
    const phone = text(raw.phone, 'phone', 30)?.replace(/[\s.-]/g, '').replace(/^\+33/, '0');
    if (phone && !/^0[1-9]\d{8}$/.test(phone)) {
      throw new ValidationError('Le téléphone doit être un numéro français à 10 chiffres.');
    }
    data.phone = phone ? Number(phone) : null;
  }

  if (has('website')) {
    const website = text(raw.website, 'website', 255);
    // Shown as a link: only web addresses.
    if (website && !/^https?:\/\/[^\s]+$/i.test(website)) {
      throw new ValidationError('Le site web doit commencer par http:// ou https://.');
    }
    data.website = website;
  }

  if (has('openingHours')) {
    const hours = (raw.openingHours ?? {}) as Record<string, unknown>;
    if (typeof hours !== 'object') {
      throw new ValidationError('Les horaires sont invalides.');
    }
    data.openingHours = Object.fromEntries(DAYS.map((day) => [day, text(hours[day], day, 60)]));
  }

  return data;
};

export const updateProfile = async (documentId: string, input: unknown) => {
  const data = parseProfile(input);
  if (Object.keys(data).length > 0) {
    await strapi.db.query(PARTNER_UID).updateMany({ where: { documentId }, data });
  }
  return getProfile(documentId);
};

/** Image type read from the file content, whatever the declared one. */
const imageType = (bytes: Buffer): { mime: string; ext: string } | null => {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
};

/** Files named this way were sent by the partner, and may be deleted by it. */
const photoPrefix = (documentId: string) => `partenaire-${documentId}-`;

const setPhotos = async (documentId: string, ids: number[]) => {
  for (const row of await versions(documentId)) {
    await strapi.db.query(PARTNER_UID).update({ where: { id: row.id }, data: { coverImage: ids } });
  }
};

const photoIds = async (documentId: string): Promise<number[]> =>
  ((await draft(documentId)).coverImage ?? []).map((file) => file.id);

export const addPhoto = async (documentId: string, file: any) => {
  if (!file || Array.isArray(file)) {
    throw new ValidationError('Envoyez une photo à la fois.');
  }
  if (file.size > MAX_PHOTO_SIZE) {
    throw new ValidationError('La photo ne doit pas dépasser 5 Mo.');
  }
  const type = imageType((await fs.readFile(file.filepath)).subarray(0, 12));
  if (!type) {
    throw new ValidationError('Formats acceptés : JPEG, PNG ou WebP.');
  }

  const ids = await photoIds(documentId);
  if (ids.length >= MAX_PHOTOS) {
    throw new ValidationError(`Vous avez atteint la limite de ${MAX_PHOTOS} photos.`);
  }

  const name = `${photoPrefix(documentId)}${crypto.randomBytes(6).toString('hex')}.${type.ext}`;
  const partner = await draft(documentId);
  file.originalFilename = name;
  file.mimetype = type.mime;
  const [uploaded] = await strapi.plugin('upload').service('upload').upload({
    data: { fileInfo: { name, alternativeText: `Photo de ${partner.name}` } },
    files: file,
  });

  await setPhotos(documentId, [...ids, uploaded.id]);
  return getProfile(documentId);
};

export const removePhoto = async (documentId: string, fileId: number) => {
  const ids = await photoIds(documentId);
  if (!ids.includes(fileId)) {
    throw new NotFoundError('Photo introuvable.');
  }
  await setPhotos(documentId, ids.filter((id) => id !== fileId));

  // A file picked by the team in the media library may be used elsewhere: it is only detached.
  const file = await strapi.db.query('plugin::upload.file').findOne({ where: { id: fileId } });
  if (file?.name?.startsWith(photoPrefix(documentId))) {
    await strapi.plugin('upload').service('upload').remove(file);
  }
  return getProfile(documentId);
};
