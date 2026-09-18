import type { Core } from '@strapi/strapi';
import { syncPermissions } from './bootstrap/permissions';
import { publishDraftOnlyDocuments } from './bootstrap/publish-drafts';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await syncPermissions(strapi);
    await publishDraftOnlyDocuments(strapi);
  },
};
