import type { Core, UID } from '@strapi/strapi';

/**
 * Likes, matches and bookings used to be created as drafts by the old like
 * lifecycle (db.query without publishedAt), which made them invisible to the
 * REST API. This publishes every document that only exists as a draft.
 * It is idempotent and does nothing once the data is clean.
 */

const UIDS: UID.ContentType[] = ['api::like.like', 'api::match.match', 'api::booking.booking'];

export const publishDraftOnlyDocuments = async (strapi: Core.Strapi) => {
  for (const uid of UIDS) {
    const rows = await strapi.db.query(uid).findMany({ select: ['documentId', 'publishedAt'] });

    const published = new Set(rows.filter((row) => row.publishedAt).map((row) => row.documentId));
    const draftOnly = [...new Set(rows.filter((row) => !row.publishedAt).map((row) => row.documentId))]
      .filter((documentId) => !published.has(documentId));

    for (const documentId of draftOnly) {
      await strapi.documents(uid as 'api::match.match').publish({ documentId });
    }

    if (draftOnly.length > 0) {
      strapi.log.info(`[publish-drafts] ${uid} : ${draftOnly.length} document(s) publié(s).`);
    }
  }
};
