import { errors } from '@strapi/utils';
import { requireUserId } from '../../../utils/auth';

const { ValidationError } = errors;

const service = () => strapi.service('api::account.account');

export default {
  /** Portabilité : toutes les données du compte, en JSON à télécharger. */
  async export(ctx) {
    const userId = requireUserId(ctx);
    const data = await service().exportData(userId);
    ctx.set('Content-Disposition', 'attachment; filename="bondiz-mes-donnees.json"');
    ctx.set('Cache-Control', 'no-store');
    ctx.body = data;
  },

  /**
   * Effacement : le mot de passe est redemandé, un téléphone laissé
   * déverrouillé ne doit pas suffire à supprimer un compte.
   */
  async delete(ctx) {
    const userId = requireUserId(ctx);
    const password = ctx.request.body?.password;
    if (typeof password !== 'string' || !password) {
      throw new ValidationError('Indique ton mot de passe pour supprimer ton compte.');
    }

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });
    const valid = user?.password
      ? await strapi.plugin('users-permissions').service('user').validatePassword(password, user.password)
      : false;
    if (!valid) {
      throw new ValidationError('Mot de passe incorrect.');
    }

    await service().deleteAccount(userId);
    ctx.body = { ok: true };
  },
};
