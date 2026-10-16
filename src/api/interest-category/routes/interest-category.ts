/**
 * Catalogue géré depuis l'administration : lecture seule par l'API.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::interest-category.interest-category', {
  only: ['find', 'findOne'],
});
