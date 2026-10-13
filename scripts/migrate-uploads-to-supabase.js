'use strict';

/**
 * Migre les fichiers déjà stockés en local (public/uploads) vers Supabase
 * Storage, puis met à jour leurs URL en base.
 *
 * Simulation (par défaut, n'écrit rien) :
 *   node scripts/migrate-uploads-to-supabase.js
 *
 * Migration réelle :
 *   node scripts/migrate-uploads-to-supabase.js --apply
 *
 * Le script est relançable : il ne traite que les fichiers encore marqués
 * `local`, et réécrit ceux déjà envoyés sans créer de doublon.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PROVIDER_NAME = 'strapi-provider-upload-supabase-bucket';

const APPLY = process.argv.includes('--apply');

// ─── configuration ──────────────────────────────────────────────────────────

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && env[match[1]] === undefined) {
        env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

const env = loadEnv();

const config = {
  apiUrl: (env.SUPABASE_API_URL || '').replace(/\/+$/, ''),
  apiKey: env.SUPABASE_API_KEY,
  bucket: env.SUPABASE_BUCKET,
  directory: (env.SUPABASE_DIRECTORY || '').replace(/^\/+|\/+$/g, ''),
};

function requireConfig() {
  const missing = ['apiUrl', 'apiKey', 'bucket'].filter((key) => !config[key]);
  if (missing.length > 0) {
    const names = missing.map((key) => `SUPABASE_${key === 'apiUrl' ? 'API_URL' : key === 'apiKey' ? 'API_KEY' : 'BUCKET'}`);
    throw new Error(`Variables manquantes dans .env : ${names.join(', ')}`);
  }
}

// ─── Supabase Storage (API REST, sans dépendance supplémentaire) ────────────

const storagePath = (hash, ext) => (config.directory ? `${config.directory}/${hash}${ext}` : `${hash}${ext}`);
const publicUrl = (key) => `${config.apiUrl}/storage/v1/object/public/${config.bucket}/${key}`;

async function uploadToSupabase(key, buffer, mime) {
  const response = await fetch(`${config.apiUrl}/storage/v1/object/${config.bucket}/${key}`, {
    method: 'POST',
    headers: {
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': mime || 'application/octet-stream',
      // Rend le script relançable sans erreur « déjà existant ».
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
}

// ─── migration ──────────────────────────────────────────────────────────────

/** Chemin local d'un fichier à partir de son URL (/uploads/xxx.jpg). */
const localPath = (url) => path.join(PUBLIC_DIR, url.replace(/^\//, ''));

/** Les variantes (miniatures) d'un fichier, plus le fichier lui-même. */
function variantsOf(file) {
  const variants = [{ label: 'original', hash: file.hash, ext: file.ext, mime: file.mime, url: file.url }];

  const formats = typeof file.formats === 'string' ? JSON.parse(file.formats) : file.formats;
  for (const [label, format] of Object.entries(formats ?? {})) {
    if (format?.url) {
      variants.push({ label, hash: format.hash, ext: format.ext, mime: format.mime, url: format.url, format });
    }
  }
  return { variants, formats };
}

async function migrate() {
  const client = new Client({
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT || 5432),
    database: env.DATABASE_NAME,
    user: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  const { rows: files } = await client.query(
    "select id, name, hash, ext, mime, url, formats from files where provider = 'local' order by id"
  );

  console.log(`${files.length} fichier(s) à migrer.`);
  if (files.length === 0) {
    await client.end();
    return;
  }

  let migrated = 0;
  let introuvables = 0;
  const erreurs = [];

  for (const file of files) {
    const { variants, formats } = variantsOf(file);

    // Un fichier manquant sur le disque ne doit pas faire échouer le reste :
    // on le signale et on laisse sa ligne inchangée.
    const absents = variants.filter((variant) => !fs.existsSync(localPath(variant.url)));
    if (absents.length > 0) {
      console.log(`  ⚠ ${file.name} : ${absents.length} fichier(s) absent(s) du disque, ignoré`);
      introuvables += 1;
      continue;
    }

    try {
      const nouvellesUrls = {};

      for (const variant of variants) {
        const key = storagePath(variant.hash, variant.ext);
        if (APPLY) {
          await uploadToSupabase(key, fs.readFileSync(localPath(variant.url)), variant.mime);
        }
        nouvellesUrls[variant.label] = publicUrl(key);
      }

      if (APPLY) {
        const nouveauxFormats = formats ? JSON.parse(JSON.stringify(formats)) : null;
        for (const [label, url] of Object.entries(nouvellesUrls)) {
          if (label !== 'original' && nouveauxFormats?.[label]) {
            nouveauxFormats[label].url = url;
          }
        }

        await client.query('update files set url = $1, formats = $2, provider = $3 where id = $4', [
          nouvellesUrls.original,
          nouveauxFormats ? JSON.stringify(nouveauxFormats) : null,
          PROVIDER_NAME,
          file.id,
        ]);
      }

      migrated += 1;
      console.log(`  ✓ ${file.name} (${variants.length} variante(s)) → ${nouvellesUrls.original}`);
    } catch (error) {
      erreurs.push(`${file.name} : ${error.message}`);
      console.log(`  ✗ ${file.name} : ${error.message}`);
    }
  }

  await client.end();

  console.log('');
  console.log(`${migrated} fichier(s) ${APPLY ? 'migré(s)' : 'prêt(s) à migrer'}.`);
  if (introuvables > 0) console.log(`${introuvables} fichier(s) absent(s) du disque.`);
  if (erreurs.length > 0) {
    console.log(`${erreurs.length} erreur(s) :`);
    erreurs.forEach((erreur) => console.log(`  - ${erreur}`));
    process.exitCode = 1;
  }
  if (!APPLY) {
    console.log('\nSimulation : rien n’a été écrit. Relancer avec --apply pour migrer.');
  }
}

(async () => {
  try {
    requireConfig();
    await migrate();
  } catch (error) {
    console.error(`Échec : ${error.message}`);
    process.exit(1);
  }
})();
