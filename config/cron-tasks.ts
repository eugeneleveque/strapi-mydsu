/**
 * Tâches planifiées (heure du serveur).
 */

export default {
  // Chaque nuit à 3 h 30 : suppression définitive des messages archivés
  // (unmatch, message retiré) au-delà de la durée de conservation.
  purgeArchivedMessages: {
    task: async ({ strapi }) => {
      const days = Number(process.env.MESSAGE_ARCHIVE_RETENTION_DAYS ?? 30);
      if (!Number.isFinite(days) || days < 0) return;
      const count = await strapi.service('api::message.message').purgeArchived(days);
      if (count > 0) strapi.log.info(`[purge] ${count} message(s) archivé(s) supprimé(s) définitivement.`);
    },
    options: { rule: '30 3 * * *' },
  },
};
