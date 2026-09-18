/**
 * activity router
 *
 * Activities are managed from the admin panel: read-only through the API.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::activity.activity', {
  only: ['find', 'findOne'],
});
