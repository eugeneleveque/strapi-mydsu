import type { Core } from '@strapi/strapi';

/**
 * Amorce le catalogue des centres d'intérêt, et reprend une dernière fois
 * les anciens centres d'intérêt stockés en texte.
 *
 * Les catégories reprennent celles du questionnaire de l'app, qui les avait
 * en dur. Une fois en base, elles se modifient depuis l'administration.
 * L'amorçage ne touche à rien si le catalogue existe déjà.
 */

const CATEGORY_UID = 'api::interest-category.interest-category';
const INTEREST_UID = 'api::interest.interest';
const USER_UID = 'plugin::users-permissions.user';

const CATALOGUE = [
  {
    name: 'Sport & Bien-être',
    icon: 'fitness-outline',
    interests: ['Sport', 'Randonnée', 'Yoga', 'Méditation', 'Danse', 'Badminton', 'Escalade', 'Natation'],
  },
  {
    name: 'Art & Créativité',
    icon: 'color-palette-outline',
    interests: ['Dessin', 'Photographie', 'Musique', 'Théâtre', 'Bricolage'],
  },
  {
    name: 'Loisirs & Sorties',
    icon: 'ticket-outline',
    interests: ['Cinéma', 'Voyage', 'Gaming', 'Lecture', 'Mode', 'Restaurant', 'Concert'],
  },
  {
    name: 'Nature & Passions',
    icon: 'leaf-outline',
    interests: ['Jardinage', 'Astronomie', 'Animaux', 'Volontariat', 'Cuisine'],
  },
];

/** « Sport & Bien-être » → « sport-bien-etre ». */
const toSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Centres d'intérêt relevés avant la synchronisation du schéma :
 * identifiant d'utilisateur → libellés de l'ancien champ texte.
 */
const anciensChoix = new Map<number, string[]>();

/**
 * Strapi supprime la colonne `interests` pendant la synchronisation du schéma,
 * qui a lieu AVANT le bootstrap. On relève donc son contenu juste avant, via
 * le hook `beforeSync`, pour pouvoir le rattacher ensuite au catalogue.
 */
export const captureLegacyInterests = async (strapi: Core.Strapi) => {
  try {
    const knex = strapi.db.connection;
    if (!(await knex.schema.hasColumn('up_users', 'interests'))) return;

    const lignes = await knex('up_users').select('id', 'interests').whereNotNull('interests');

    for (const ligne of lignes) {
      let valeurs: unknown = ligne.interests;
      if (typeof valeurs === 'string') {
        try {
          valeurs = JSON.parse(valeurs);
        } catch {
          continue;
        }
      }
      if (Array.isArray(valeurs) && valeurs.length > 0) {
        anciensChoix.set(ligne.id, valeurs.map(String));
      }
    }

    if (anciensChoix.size > 0) {
      strapi.log.info(`[interests] ${anciensChoix.size} profil(s) relevé(s) avant suppression de l'ancien champ.`);
    }
  } catch (error) {
    strapi.log.warn(`[interests] relevé de l'ancien champ impossible : ${(error as Error).message}`);
  }
};

export const seedInterests = async (strapi: Core.Strapi) => {
  const existing = await strapi.db.query(CATEGORY_UID).count();

  if (existing === 0) {
    for (const [index, category] of CATALOGUE.entries()) {
      const created = await strapi.documents(CATEGORY_UID).create({
        data: { name: category.name, slug: toSlug(category.name), icon: category.icon, sortOrder: index },
      });

      for (const interest of category.interests) {
        await strapi.documents(INTEREST_UID).create({
          data: { name: interest, slug: toSlug(interest), category: created.id },
        });
      }
    }

    const total = CATALOGUE.reduce((sum, category) => sum + category.interests.length, 0);
    strapi.log.info(`[interests] catalogue amorcé : ${CATALOGUE.length} catégories, ${total} centres d'intérêt.`);
  }

  await reprendreAncienChamp(strapi);
};

/**
 * Rattache au catalogue les centres d'intérêt relevés avant la suppression
 * de l'ancienne colonne.
 */
const reprendreAncienChamp = async (strapi: Core.Strapi) => {
  if (anciensChoix.size === 0) return;

  const interests = await strapi.db.query(INTEREST_UID).findMany({ select: ['id', 'name'] });
  const parNom = new Map(interests.map((interest) => [toSlug(interest.name), interest.id]));

  let rattaches = 0;
  const inconnus = new Set<string>();

  for (const [userId, valeurs] of anciensChoix) {
    const utilisateur = await strapi.db.query(USER_UID).findOne({
      where: { id: userId },
      populate: { interestTags: { select: ['id'] } },
    });
    // Disparu entre-temps, ou déjà rattaché.
    if (!utilisateur || utilisateur.interestTags?.length > 0) continue;

    const ids: number[] = [];
    for (const valeur of valeurs) {
      const id = parNom.get(toSlug(valeur));
      if (id) ids.push(id);
      else inconnus.add(valeur);
    }

    if (ids.length > 0) {
      await strapi.db.query(USER_UID).update({ where: { id: userId }, data: { interestTags: ids } });
      rattaches += 1;
    }
  }

  anciensChoix.clear();

  if (rattaches > 0) {
    strapi.log.info(`[interests] ${rattaches} profil(s) repris depuis l'ancien champ texte.`);
  }
  if (inconnus.size > 0) {
    strapi.log.warn(`[interests] absents du catalogue, à créer depuis l'admin : ${[...inconnus].join(', ')}`);
  }
};
