# 🚀 Bondiz — API Strapi

Backend de Bondiz : rencontre amicale (like / match), messagerie entre matchs,
et réservation d'activités auprès de partenaires.

## Démarrer

```bash
npm install
cp .env.example .env   # puis renseigner les secrets
npm run develop
```

## Notifications push

L'API envoie des notifications Web Push aux navigateurs abonnés (la version web
installable de l'app) :

- à la réception d'un message, au destinataire ;
- à la création d'un match, à la personne qui avait liké en premier.

Elles sont désactivées tant que les clés VAPID ne sont pas renseignées : le
reste de l'API fonctionne normalement sans elles.

```bash
npx web-push generate-vapid-keys   # une seule fois
```

| Variable | Rôle |
|---|---|
| `VAPID_PUBLIC_KEY` | Clé publique, transmise au navigateur |
| `VAPID_PRIVATE_KEY` | Clé privée, à garder secrète |
| `VAPID_SUBJECT` | Contact transmis aux services de push (`mailto:` ou `https://`) |

Changer de clés invalide tous les abonnements existants.

| Route | Rôle |
|---|---|
| `GET /api/push/public-key` | Clé publique (`null` si non configuré) |
| `POST /api/push/subscriptions` | Abonne le navigateur de l'utilisateur connecté |
| `POST /api/push/subscriptions/unsubscribe` | Désabonne un navigateur (`endpoint` dans le corps) |

À savoir :

- l'envoi part en arrière-plan : une notification en échec ne ralentit ni ne
  fait échouer la requête qui l'a déclenchée ;
- un abonnement que le service de push déclare expiré (404 ou 410) est supprimé ;
- seules les adresses des services de push connus (Google, Mozilla, Apple,
  Microsoft) sont acceptées comme `endpoint` ;
- les abonnements sont supprimés avec le compte.

Le code est dans `src/api/push-subscription/`.

## Compte et RGPD

| Route | Rôle |
|---|---|
| `GET /api/account/export` | Toutes les données de l'utilisateur connecté, en JSON (portabilité) |
| `POST /api/account/delete` | Supprime définitivement le compte ; `password` obligatoire dans le corps |
| `GET /api/favorites` | documentIds des activités favorites (publiées) |
| `PUT /api/favorites/:documentId` | Ajoute un favori (sans doublon), renvoie la liste |
| `DELETE /api/favorites/:documentId` | Retire un favori, renvoie la liste |

La suppression (`POST /api/account/delete`, et aussi `DELETE /api/users/:id`)
efface les messages (archivés compris), likes, matchs, réservations
organisées, consultations de profil, favoris, abonnements push et photos. Les
réservations des autres perdent simplement ce participant. Le code est dans
`src/api/account/`.

Les messages archivés (unmatch, message retiré) sont supprimés définitivement
chaque nuit à 3 h 30 au-delà de `MESSAGE_ARCHIVE_RETENTION_DAYS` jours (30 par
défaut) : voir `config/cron-tasks.ts`.

### Mot de passe oublié

Routes de Strapi : `POST /api/auth/forgot-password` (`email`) puis
`POST /api/auth/reset-password` (`code`, `password`, `passwordConfirmation`).
L'e-mail, en français, mène à `$APP_URL/reset-password?code=…` ; son texte et
ce lien sont réécrits à chaque démarrage par `src/bootstrap/emails.ts`.

| Variable | Rôle |
|---|---|
| `APP_URL` | Adresse de l'app (`https://app.bondiz.fr` par défaut) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Serveur d'envoi ; **sans `SMTP_HOST`, aucun e-mail ne part** |
| `SMTP_USER`, `SMTP_PASSWORD` | Identifiants SMTP |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | Expéditeur (`Bondiz <no-reply@bondiz.fr>`) et adresse de réponse |

### Carte : positions des partenaires

La carte de l'app place chaque activité à la latitude et la longitude de son
partenaire. Pour remplir celles qui manquent à partir des adresses (API Adresse
de l'État, adresses françaises) :

```bash
node scripts/geocode-partners.js          # aperçu, ne modifie rien
node scripts/geocode-partners.js --apply  # enregistre les positions trouvées
```

Le script vise la base Postgres du `.env`, n'écrase jamais une position déjà
saisie et ignore les résultats incertains : ceux-là se corrigent dans l'admin.

## Tests

Les tests d'intégration démarrent une vraie instance Strapi sur une base SQLite
jetable (une par suite) et interrogent l'API par HTTP. Ils ne touchent jamais la
base de développement ni le stockage Supabase.

```bash
npm test               # toutes les suites
npm run test:coverage  # avec le rapport de couverture
npx jest test/integration/conversation.test.js   # une seule suite
```

Organisation :

| Fichier | Couvre |
|---|---|
| `test/integration/users.test.js` | inscription, connexion, cloisonnement des profils |
| `test/integration/like-match.test.js` | likes, création automatique du match |
| `test/integration/conversation.test.js` | chat entre matchs, non-lus, archivage |
| `test/integration/booking.test.js` | réservations, groupes, places, états |
| `test/integration/discover.test.js` | profils à découvrir, filtres, distance |
| `test/integration/upload.test.js` | envoi d'images, droits sur les fichiers |
| `test/integration/push.test.js` | abonnement aux notifications, envoi, déclencheurs |
| `test/integration/services.test.js` | règles métier au niveau des services |
| `test/integration/account.test.js` | export RGPD, suppression du compte, purge des archives, mot de passe oublié |
| `test/integration/favorite.test.js` | favoris par utilisateur |
| `test/helpers/` | démarrage de Strapi, remise à zéro, fabriques de données |

Les tests s'exécutent en série (`--runInBand`) : chaque suite démarre son
propre Strapi.

## Intégration continue

`.github/workflows/ci.yml` lance les tests et la couverture à chaque push et
pull request, puis construit l'image Docker de production.

---

# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
