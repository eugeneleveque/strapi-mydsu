import type { Core } from '@strapi/strapi';
import { syncPermissions } from './bootstrap/permissions';
import { publishDraftOnlyDocuments } from './bootstrap/publish-drafts';
import { captureLegacyInterests, seedInterests } from './bootstrap/interests';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // Dernier moment où l'ancienne colonne `interests` existe encore :
    // la synchronisation du schéma la supprime juste après.
    strapi.hook('strapi::content-types.beforeSync').register(() => captureLegacyInterests(strapi));
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await syncPermissions(strapi);
    await publishDraftOnlyDocuments(strapi);
    await seedInterests(strapi);
  },
};
