/**
 * Compte de l'utilisateur connecté (droits RGPD).
 */

export default {
  routes: [
    { method: 'GET', path: '/account/export', handler: 'account.export' },
    // POST plutôt que DELETE : le corps (mot de passe) d'un DELETE n'est pas lu.
    { method: 'POST', path: '/account/delete', handler: 'account.delete' },
  ],
};
