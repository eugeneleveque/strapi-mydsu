/**
 * like router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::like.like', {
  only: ['find', 'findOne', 'create', 'delete'],
});
