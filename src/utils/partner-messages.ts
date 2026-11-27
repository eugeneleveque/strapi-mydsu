/**
 * Messages between a partner and the Bondiz team: one thread per partner.
 * The content type has no route of its own; messages are only reachable
 * through the partner portal and the blog admin.
 *
 * Messages point to the partner's documentId rather than a relation, which
 * would be tied to either the draft or the published version.
 */

import { errors } from '@strapi/utils';

const { NotFoundError, ValidationError } = errors;

const MESSAGE_UID = 'api::partner-message.partner-message';
const PARTNER_UID = 'api::partner.partner';

const MAX_LENGTH = 2000;
const THREAD_LIMIT = 200;

type Side = 'partner' | 'team';

const toOutput = (message) => ({
  documentId: message.documentId,
  content: message.content,
  fromTeam: Boolean(message.fromTeam),
  createdAt: message.createdAt,
  readAt: message.readAt ?? null,
});

/** The partner as the team sees it (drafts are the reference version). */
export const requirePartner = async (documentId: string) => {
  const partner = await strapi.db.query(PARTNER_UID).findOne({
    where: { documentId, publishedAt: { $null: true } },
  });
  if (!partner) {
    throw new NotFoundError('Partenaire introuvable.');
  }
  return { documentId, name: partner.name ?? null, email: partner.email ?? null };
};

/** The latest messages, oldest first. Reading marks the other side's as read. */
export const listMessages = async (partnerDocumentId: string, reader: Side) => {
  const latest = await strapi.db.query(MESSAGE_UID).findMany({
    where: { partnerDocumentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    limit: THREAD_LIMIT,
  });

  await strapi.db.query(MESSAGE_UID).updateMany({
    where: { partnerDocumentId, fromTeam: reader === 'partner', readAt: { $null: true } },
    data: { readAt: new Date() },
  });

  return latest.reverse().map(toOutput);
};

export const sendMessage = async (partnerDocumentId: string, author: Side, content: unknown) => {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new ValidationError('Le message est vide.');
  }
  if (text.length > MAX_LENGTH) {
    throw new ValidationError(`Le message ne doit pas dépasser ${MAX_LENGTH} caractères.`);
  }

  const message = await strapi.documents(MESSAGE_UID).create({
    data: { partnerDocumentId, content: text, fromTeam: author === 'team' },
  });
  return toOutput(message);
};

/** Team inbox: one line per partner who has messages, most recent first. */
export const listConversations = async () => {
  const messages = await strapi.db.query(MESSAGE_UID).findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    limit: 2000,
  });

  const threads = new Map<string, { last: ReturnType<typeof toOutput>; unread: number }>();
  for (const message of messages) {
    const thread = threads.get(message.partnerDocumentId) ?? { last: toOutput(message), unread: 0 };
    if (!message.fromTeam && !message.readAt) thread.unread += 1;
    threads.set(message.partnerDocumentId, thread);
  }
  if (threads.size === 0) return [];

  const partners = await strapi.db.query(PARTNER_UID).findMany({
    where: { documentId: { $in: [...threads.keys()] }, publishedAt: { $null: true } },
  });
  const names = new Map(partners.map((partner) => [partner.documentId, partner.name]));

  // Threads of deleted partners are left out.
  return [...threads]
    .filter(([documentId]) => names.has(documentId))
    .map(([documentId, thread]) => ({
      documentId,
      name: names.get(documentId),
      lastMessage: thread.last,
      unread: thread.unread,
    }));
};
