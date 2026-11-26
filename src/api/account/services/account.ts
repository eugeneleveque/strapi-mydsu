/**
 * Droits RGPD de l'utilisateur sur son propre compte :
 * - portabilité : export de toutes ses données dans un fichier JSON ;
 * - effacement : suppression du compte et de tout ce qui s'y rattache.
 */

const USER_UID = 'plugin::users-permissions.user';
const LIKE_UID = 'api::like.like';
const MATCH_UID = 'api::match.match';
const MESSAGE_UID = 'api::message.message';
const BOOKING_UID = 'api::booking.booking';
const PROFILE_VIEW_UID = 'api::profile-view.profile-view';
const FILE_UID = 'plugin::upload.file';

const who = (user: any) => user?.username ?? null;

// Les contenus avec brouillon existent en deux lignes : on n'exporte que la
// version publiée, ou le brouillon s'il n'a jamais été publié.
const oneVersionPerDocument = <T extends { documentId?: string; publishedAt?: unknown }>(rows: T[]) => {
  const byDocument = new Map<string, T>();
  for (const row of rows) {
    const key = row.documentId ?? String((row as any).id);
    const current = byDocument.get(key);
    if (!current || (!current.publishedAt && row.publishedAt)) byDocument.set(key, row);
  }
  return [...byDocument.values()];
};

export default ({ strapi }) => ({
  /** Toutes les données personnelles de l'utilisateur, lisibles telles quelles. */
  async exportData(userId: number) {
    const user = await strapi.db.query(USER_UID).findOne({
      where: { id: userId },
      populate: { interestTags: { select: ['name'] }, self_image: { select: ['url', 'name', 'createdAt'] } },
    });
    if (!user) return null;

    const [likesSent, likesReceived, matches, messages, organized, participated, views, favorites, pushCount] =
      await Promise.all([
        strapi.db.query(LIKE_UID).findMany({
          where: { fromUser: { id: userId } },
          populate: { toUser: { select: ['username'] } },
        }),
        strapi.db.query(LIKE_UID).findMany({ where: { toUser: { id: userId } }, select: ['documentId'] }),
        strapi.db.query(MATCH_UID).findMany({
          where: { $or: [{ user1: { id: userId } }, { user2: { id: userId } }] },
          populate: { user1: { select: ['id', 'username'] }, user2: { select: ['id', 'username'] } },
        }),
        strapi.db.query(MESSAGE_UID).findMany({
          where: {
            $and: [{ $or: [{ sender: { id: userId } }, { recipient: { id: userId } }] }, { deletedAt: { $null: true } }],
          },
          populate: { sender: { select: ['id', 'username'] }, recipient: { select: ['id', 'username'] } },
          orderBy: { createdAt: 'asc' },
        }),
        strapi.db.query(BOOKING_UID).findMany({
          where: { organizer: { id: userId } },
          populate: { participants: { select: ['username'] } },
        }),
        strapi.db.query(BOOKING_UID).findMany({
          where: { participants: { id: userId } },
          populate: { organizer: { select: ['username'] } },
        }),
        strapi.db.query(PROFILE_VIEW_UID).findMany({
          where: { viewer: { id: userId } },
          populate: { viewed: { select: ['username'] } },
        }),
        strapi.service('api::favorite.favorite').listForUser(userId),
        strapi.db.query('api::push-subscription.push-subscription').count({ where: { user: { id: userId } } }),
      ]);

    const booking = (row: any) => ({
      activite: row.activityName ?? null,
      date: row.date ?? null,
      heure: row.time ?? null,
      statut: row.state ?? null,
    });

    return {
      exporteLe: new Date().toISOString(),
      compte: {
        identifiant: user.username,
        email: user.email,
        prenom: user.firstName ?? null,
        nom: user.lastName ?? null,
        telephone: user.phone ?? null,
        dateDeNaissance: user.age ?? null,
        genre: user.gender ?? null,
        ville: user.city ?? null,
        presentation: user.bio ?? null,
        latitude: user.latitude ?? null,
        longitude: user.longitude ?? null,
        creeLe: user.createdAt,
        modifieLe: user.updatedAt,
      },
      centresInteret: (user.interestTags ?? []).map((tag: any) => tag.name),
      photos: (user.self_image ?? []).map((file: any) => ({ url: file.url, ajouteeLe: file.createdAt })),
      likesEnvoyes: oneVersionPerDocument(likesSent).map((like: any) => ({
        a: who(like.toUser),
        le: like.createdAt,
      })),
      nombreDeLikesRecus: new Set(likesReceived.map((like: any) => like.documentId)).size,
      connexions: oneVersionPerDocument(matches).map((match: any) => ({
        avec: who(match.user1?.id === userId ? match.user2 : match.user1),
        le: match.createdAt,
      })),
      messages: messages.map((message: any) => ({
        sens: message.sender?.id === userId ? 'envoyé' : 'reçu',
        avec: who(message.sender?.id === userId ? message.recipient : message.sender),
        contenu: message.content,
        le: message.sentAt ?? message.createdAt,
        lu: Boolean(message.isRead),
      })),
      reservationsOrganisees: oneVersionPerDocument(organized).map((row: any) => ({
        ...booking(row),
        participants: (row.participants ?? []).map(who),
      })),
      reservationsRejointes: oneVersionPerDocument(participated).map((row: any) => ({
        ...booking(row),
        organisateur: who(row.organizer),
      })),
      profilsConsultes: views.map((view: any) => ({
        profil: who(view.viewed),
        action: view.action === 'skipped' ? 'passé' : 'vu',
        le: view.seenAt ?? view.createdAt,
        fois: view.viewCount ?? 1,
      })),
      activitesFavorites: favorites,
      appareilsAbonnesAuxNotifications: pushCount,
    };
  },

  /**
   * Efface tout ce qui se rattache au compte, sauf le compte lui-même :
   * messages (archivés compris), likes, matchs, réservations organisées,
   * consultations de profil, favoris, abonnements push et photos.
   * Les réservations des autres perdent simplement ce participant.
   */
  async deleteUserData(userId: number) {
    await strapi.service('api::push-subscription.push-subscription').removeAllForUser(userId);
    await strapi.service('api::favorite.favorite').removeAllForUser(userId);

    await strapi.db.query(PROFILE_VIEW_UID).deleteMany({
      where: { $or: [{ viewer: { id: userId } }, { viewed: { id: userId } }] },
    });
    await strapi.db.query(MESSAGE_UID).deleteMany({
      where: { $or: [{ sender: { id: userId } }, { recipient: { id: userId } }] },
    });
    await strapi.db.query(MATCH_UID).deleteMany({
      where: { $or: [{ user1: { id: userId } }, { user2: { id: userId } }] },
    });
    await strapi.db.query(LIKE_UID).deleteMany({
      where: { $or: [{ fromUser: { id: userId } }, { toUser: { id: userId } }] },
    });
    await strapi.db.query(BOOKING_UID).deleteMany({ where: { organizer: { id: userId } } });

    const user = await strapi.db.query(USER_UID).findOne({
      where: { id: userId },
      populate: { self_image: true },
    });
    const upload = strapi.plugin('upload').service('upload');
    for (const file of user?.self_image ?? []) {
      try {
        await upload.remove(file);
      } catch (error) {
        // Une photo déjà absente du stockage ne doit pas bloquer l'effacement.
        strapi.log.warn(`[compte] Photo ${file.id} non supprimée du stockage : ${error.message}`);
        await strapi.db.query(FILE_UID).delete({ where: { id: file.id } });
      }
    }
  },

  async deleteAccount(userId: number) {
    await this.deleteUserData(userId);
    await strapi.db.query(USER_UID).delete({ where: { id: userId } });
  },
});
