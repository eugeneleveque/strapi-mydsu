import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::message.message', {
  only: ['find', 'findOne', 'create', 'update', 'delete'],
});
