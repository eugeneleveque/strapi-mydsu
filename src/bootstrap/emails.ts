import type { Core } from '@strapi/strapi';

/**
 * E-mail « mot de passe oublié », versionné dans le code comme les
 * permissions : le lien mène à l'écran /reset-password de l'app, qui renvoie
 * le code reçu à POST /api/auth/reset-password.
 */

const RESET_MESSAGE = `<p>Bonjour,</p>
<p>Tu as demandé à changer le mot de passe de ton compte Bondiz.</p>
<p><a href="<%= URL %>?code=<%= TOKEN %>">Choisir un nouveau mot de passe</a></p>
<p>Si le lien ne s’ouvre pas, copie cette adresse dans ton navigateur :<br><%= URL %>?code=<%= TOKEN %></p>
<p>Tu n’es pas à l’origine de cette demande ? Ignore simplement cet e-mail : ton mot de passe ne change pas.</p>
<p>L’équipe Bondiz</p>`;

const parseFrom = (from: string) => {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1], email: match[2] } : { name: 'Bondiz', email: from.trim() };
};

export const syncEmailSettings = async (strapi: Core.Strapi) => {
  const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
  const appUrl = (process.env.APP_URL || 'https://app.bondiz.fr').replace(/\/$/, '');

  const advanced = ((await store.get({ key: 'advanced' })) ?? {}) as Record<string, unknown>;
  await store.set({ key: 'advanced', value: { ...advanced, email_reset_password: `${appUrl}/reset-password` } });

  const emails = ((await store.get({ key: 'email' })) ?? {}) as Record<string, any>;
  const from = parseFrom(process.env.EMAIL_FROM || 'Bondiz <no-reply@bondiz.fr>');
  await store.set({
    key: 'email',
    value: {
      ...emails,
      reset_password: {
        ...emails.reset_password,
        options: {
          from,
          response_email: process.env.EMAIL_REPLY_TO || 'bondizmydsu@gmail.com',
          object: 'Bondiz : choisis un nouveau mot de passe',
          message: RESET_MESSAGE,
        },
      },
    },
  });

  if (!process.env.SMTP_HOST && process.env.NODE_ENV === 'production') {
    strapi.log.warn('[e-mails] SMTP_HOST absent : les e-mails « mot de passe oublié » ne partent pas.');
  }
};
