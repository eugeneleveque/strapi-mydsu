#!/usr/bin/env node
'use strict';

/**
 * Remplit la latitude et la longitude des partenaires qui n'en ont pas,
 * à partir de leur adresse, pour la carte de l'app.
 *
 * Géocodage : API Adresse de l'État (https://adresse.data.gouv.fr), gratuite
 * et sans clé, pour les adresses françaises.
 *
 *   node scripts/geocode-partners.js          # aperçu, ne modifie rien
 *   node scripts/geocode-partners.js --apply  # enregistre les positions trouvées
 *
 * La base visée est celle du .env (variables DATABASE_*), Postgres seulement.
 * Les positions déjà saisies ne sont jamais écrasées, et un résultat jugé
 * peu fiable (score < 0,6) est seulement affiché.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const MIN_SCORE = 0.6;

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  const values = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  // Les variables déjà définies dans le shell l'emportent sur le .env.
  return { ...values, ...process.env };
}

async function geocode(partner) {
  const query = [partner.address, partner.postal_code, partner.city].filter(Boolean).join(' ');
  const url = new URL('https://api-adresse.data.gouv.fr/search/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  if (partner.postal_code) url.searchParams.set('postcode', String(partner.postal_code));

  const response = await fetch(url, { headers: { 'User-Agent': 'bondiz-geocode-partners' } });
  if (!response.ok) throw new Error(`API Adresse : ${response.status}`);
  const feature = (await response.json()).features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  return { latitude, longitude, score: feature.properties.score, label: feature.properties.label };
}

async function main() {
  const env = loadEnv();
  if ((env.DATABASE_CLIENT ?? 'sqlite') !== 'postgres') {
    throw new Error('DATABASE_CLIENT doit valoir "postgres".');
  }

  const client = new Client(
    env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL }
      : {
          host: env.DATABASE_HOST,
          port: Number(env.DATABASE_PORT || 5432),
          database: env.DATABASE_NAME,
          user: env.DATABASE_USERNAME,
          password: env.DATABASE_PASSWORD,
          ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
        }
  );
  await client.connect();

  try {
    // Une ligne par document (brouillon et version publiée partagent l'adresse).
    const { rows } = await client.query(`
      SELECT DISTINCT ON (document_id) document_id, name, address, postal_code, city
      FROM partners
      WHERE latitude IS NULL OR longitude IS NULL
      ORDER BY document_id, published_at DESC NULLS LAST
    `);

    if (rows.length === 0) {
      console.log('Tous les partenaires ont déjà une position.');
      return;
    }

    const found = [];
    for (const partner of rows) {
      if (!partner.address && !partner.postal_code) {
        console.log(`– ${partner.name} : pas d'adresse, à saisir dans l'admin.`);
        continue;
      }
      const result = await geocode(partner);
      // L'API demande de ne pas dépasser 50 requêtes par seconde : on reste large.
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!result) {
        console.log(`✗ ${partner.name} : adresse introuvable (${[partner.address, partner.postal_code, partner.city].filter(Boolean).join(', ')}).`);
      } else if (result.score < MIN_SCORE) {
        console.log(`? ${partner.name} : résultat incertain « ${result.label} » (score ${result.score.toFixed(2)}), non enregistré.`);
      } else {
        console.log(`✓ ${partner.name} → ${result.label} (${result.latitude}, ${result.longitude})`);
        found.push({ partner, result });
      }
    }

    if (!APPLY) {
      console.log(`\nAperçu seulement : ${found.length} position(s) à enregistrer. Relancer avec --apply pour les écrire.`);
      return;
    }

    await client.query('BEGIN');
    for (const { partner, result } of found) {
      await client.query(
        `UPDATE partners SET latitude = $2, longitude = $3
         WHERE document_id = $1 AND (latitude IS NULL OR longitude IS NULL)`,
        [partner.document_id, result.latitude, result.longitude]
      );
    }
    await client.query('COMMIT');
    console.log(`\n${found.length} partenaire(s) mis à jour.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Erreur : ${error.message}`);
  process.exit(1);
});
