'use strict';

/**
 * Le téléphone des utilisateurs passe de biginteger à texte : un nombre perd
 * le 0 initial (0612345678 était stocké 612345678).
 *
 * Strapi lance cette migration avant de synchroniser le schéma. Sous
 * Postgres, on change donc nous-mêmes la colonne (varchar(255), le type que
 * Strapi donne à un champ « string ») pour pouvoir y remettre les zéros :
 * un numéro de 9 chiffres est un numéro français à 10 chiffres amputé de son
 * 0, l'app n'acceptant pas moins de 9 chiffres.
 *
 * Sous SQLite (développement), la synchronisation du schéma suffit ; les
 * numéros déjà enregistrés restent tels quels.
 */
module.exports = {
  async up(knex) {
    if (knex.client.dialect !== 'postgresql') return;
    if (!(await knex.schema.hasColumn('up_users', 'phone'))) return;

    const { rows } = await knex.raw(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'up_users' AND column_name = 'phone'`
    );
    if (rows[0]?.data_type === 'bigint') {
      await knex.raw('ALTER TABLE up_users ALTER COLUMN phone TYPE varchar(255) USING phone::text');
    }

    await knex.raw(`UPDATE up_users SET phone = '0' || phone WHERE phone ~ '^[1-9][0-9]{8}$'`);
  },
};
