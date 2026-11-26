/**
 * Favoris de l'utilisateur connecté, désignés par le documentId de l'activité.
 * Chaque route renvoie la liste à jour.
 */

export default {
  routes: [
    { method: 'GET', path: '/favorites', handler: 'favorite.find' },
    { method: 'PUT', path: '/favorites/:activityId', handler: 'favorite.add' },
    { method: 'DELETE', path: '/favorites/:activityId', handler: 'favorite.remove' },
  ],
};
