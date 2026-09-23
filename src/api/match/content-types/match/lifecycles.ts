/**
 * Unmatching closes the conversation: the messages exchanged by the two users
 * are archived (soft delete with `deletedAt`), so they disappear from the API
 * while staying available for moderation.
 *
 * Implemented as a lifecycle so it also applies to deletions made from the
 * admin panel.
 *
 * A match exists as two rows (draft and published), and Strapi fires the
 * delete hooks once per row, in parallel. The pairs are collected before the
 * delete; the messages are archived only when no row of that document is left
 * (so unpublishing does not close the chat), and a short-lived guard makes
 * sure the parallel calls archive the conversation only once.
 */

const MATCH_UID = 'api::match.match';
const MESSAGE_UID = 'api::message.message' as const;

// documentId -> timestamp, to ignore the twin call of the other version.
const recentlyArchived = new Map<string, number>();
const GUARD_MS = 30_000;

const alreadyArchived = (documentId: string) => {
  const now = Date.now();
  for (const [key, at] of recentlyArchived) {
    if (now - at > GUARD_MS) recentlyArchived.delete(key);
  }
  if (recentlyArchived.has(documentId)) return true;
  recentlyArchived.set(documentId, now);
  return false;
};

const collectPairs = async (event) => {
  const matches = await strapi.db.query(MATCH_UID).findMany({
    where: event.params.where,
    populate: { user1: { select: ['id'] }, user2: { select: ['id'] } },
  });

  event.state.deletedMatches = matches
    .filter((match) => match.user1?.id && match.user2?.id)
    .map((match) => ({
      documentId: match.documentId,
      user1Id: match.user1.id,
      user2Id: match.user2.id,
    }));
};

const deleteConversations = async (event) => {
  const deletedMatches = event.state?.deletedMatches ?? [];
  const seen = new Set<string>();

  for (const { documentId, user1Id, user2Id } of deletedMatches) {
    if (seen.has(documentId)) continue;
    seen.add(documentId);

    if (alreadyArchived(documentId)) continue;

    // Another version of this match is still there (e.g. unpublish): keep the chat.
    const remaining = await strapi.db.query(MATCH_UID).count({ where: { documentId } });
    if (remaining > 0) continue;

    const count = await strapi.service(MESSAGE_UID).archive(
      {
        $or: [
          { sender: { id: user1Id }, recipient: { id: user2Id } },
          { sender: { id: user2Id }, recipient: { id: user1Id } },
        ],
      },
      'unmatch'
    );

    if (count > 0) {
      strapi.log.info(`[unmatch] ${count} message(s) archivé(s) avec le match ${documentId}.`);
    }
  }
};

export default {
  beforeDelete: collectPairs,
  beforeDeleteMany: collectPairs,
  afterDelete: deleteConversations,
  afterDeleteMany: deleteConversations,
};
