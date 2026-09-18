/**
 * partner router
 *
 * Partners are managed from the admin panel: read-only through the API.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::partner.partner', {
  only: ['find', 'findOne'],
});
