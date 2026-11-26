/**
 * Activités favorites d'un utilisateur.
 *
 * On garde le documentId de l'activité plutôt qu'une relation : une activité
 * a deux lignes (brouillon et publiée) dont l'id change à chaque
 * publication, alors que le documentId reste stable.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { NotFoundError, ValidationError } = errors;

const FAVORITE_UID = 'api::favorite.favorite';
const ACTIVITY_UID = 'api::activity.activity';

const MAX_FAVORITES = 200;

export default factories.createCoreService(FAVORITE_UID, ({ strapi }) => ({
  /** documentIds des activités favorites encore publiées, du plus récent au plus ancien. */
  async listForUser(userId: number): Promise<string[]> {
    const favorites = await strapi.db.query(FAVORITE_UID).findMany({
      where: { user: { id: userId } },
      select: ['activityDocumentId'],
      orderBy: { createdAt: 'desc' },
    });
    const ids = favorites.map((favorite) => favorite.activityDocumentId);
    if (ids.length === 0) return [];

    const published = await strapi.db.query(ACTIVITY_UID).findMany({
      where: { documentId: { $in: ids }, publishedAt: { $notNull: true } },
      select: ['documentId'],
    });
    const available = new Set(published.map((activity) => activity.documentId));
    return ids.filter((id) => available.has(id));
  },

  /** Ajout idempotent : un favori déjà présent n'est pas dupliqué. */
  async add(userId: number, activityDocumentId: string) {
    if (typeof activityDocumentId !== 'string' || !activityDocumentId.trim()) {
      throw new ValidationError('Activité invalide.');
    }

    const activity = await strapi.db.query(ACTIVITY_UID).findOne({
      where: { documentId: activityDocumentId, publishedAt: { $notNull: true } },
      select: ['id'],
    });
    if (!activity) throw new NotFoundError('Activité introuvable.');

    const existing = await strapi.db.query(FAVORITE_UID).findOne({
      where: { user: { id: userId }, activityDocumentId },
      select: ['id'],
    });
    if (existing) return;

    const count = await strapi.db.query(FAVORITE_UID).count({ where: { user: { id: userId } } });
    if (count >= MAX_FAVORITES) {
      throw new ValidationError(`Tu ne peux pas garder plus de ${MAX_FAVORITES} favoris.`);
    }

    await strapi.db.query(FAVORITE_UID).create({ data: { user: userId, activityDocumentId } });
  },

  async remove(userId: number, activityDocumentId: string) {
    await strapi.db.query(FAVORITE_UID).deleteMany({ where: { user: { id: userId }, activityDocumentId } });
  },

  async removeAllForUser(userId: number) {
    await strapi.db.query(FAVORITE_UID).deleteMany({ where: { user: { id: userId } } });
  },
}));
