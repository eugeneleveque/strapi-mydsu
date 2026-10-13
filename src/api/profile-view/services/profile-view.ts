/**
 * profile-view service
 *
 * Enregistre qui a vu quel profil. Volontairement sans effet sur /discover :
 * un profil vu continue d'être proposé.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ValidationError, NotFoundError } = errors;

const VIEW_UID = 'api::profile-view.profile-view';
const USER_UID = 'plugin::users-permissions.user';

const ACTIONS = ['seen', 'skipped'] as const;
type ViewAction = (typeof ACTIONS)[number];

// Une page de /discover en renvoie au plus 50 : on accepte un peu plus.
const MAX_BATCH = 100;

export default factories.createCoreService(VIEW_UID, ({ strapi }) => ({
  /**
   * Une seule ligne par couple (viewer, viewed) : les vues suivantes
   * actualisent la date et incrémentent le compteur.
   */
  async record(viewerId: number, viewedId: number, action: ViewAction = 'seen') {
    if (!Number.isInteger(viewedId) || viewedId <= 0) {
      throw new ValidationError('Le champ "viewed" doit être un identifiant valide.');
    }
    if (viewerId === viewedId) {
      throw new ValidationError('Un utilisateur ne peut pas se voir lui-même.');
    }
    if (!ACTIONS.includes(action)) {
      throw new ValidationError(`Le champ "action" doit valoir ${ACTIONS.join(' ou ')}.`);
    }

    const viewed = await strapi.db.query(USER_UID).findOne({ where: { id: viewedId }, select: ['id'] });
    if (!viewed) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    const existing = await strapi.db.query(VIEW_UID).findOne({
      where: { viewer: { id: viewerId }, viewed: { id: viewedId } },
      select: ['id', 'viewCount', 'action'],
    });

    if (existing) {
      return strapi.db.query(VIEW_UID).update({
        where: { id: existing.id },
        data: {
          // « skipped » l'emporte : un profil explicitement passé le reste,
          // même s'il est réaffiché ensuite.
          action: existing.action === 'skipped' ? 'skipped' : action,
          seenAt: new Date(),
          viewCount: (existing.viewCount ?? 1) + 1,
        },
      });
    }

    return strapi.documents(VIEW_UID).create({
      data: { viewer: viewerId, viewed: viewedId, action, seenAt: new Date(), viewCount: 1 },
    });
  },

  /**
   * Enregistrement groupé : l'app envoie en une fois les profils d'une page.
   * Les entrées invalides sont signalées sans faire échouer les autres.
   */
  async recordMany(viewerId: number, views: unknown) {
    if (!Array.isArray(views)) {
      throw new ValidationError('Le champ "views" doit être une liste.');
    }
    if (views.length > MAX_BATCH) {
      throw new ValidationError(`Pas plus de ${MAX_BATCH} profils à la fois.`);
    }

    const recorded = [];
    const failures: string[] = [];

    for (const view of views) {
      const viewedId = Number((view as any)?.viewed ?? view);
      const action = ((view as any)?.action ?? 'seen') as ViewAction;
      try {
        recorded.push(await this.record(viewerId, viewedId, action));
      } catch (error) {
        failures.push(`${viewedId} : ${(error as Error).message}`);
      }
    }

    return { recorded, failures };
  },

  /** Scope des contrôleurs : ses propres consultations. */
  userScope(userId: number) {
    return { viewer: { id: userId } };
  },
}));
