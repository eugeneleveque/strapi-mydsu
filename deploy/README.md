# Déploiement de l'API Bondiz

Architecture retenue : GitHub Actions construit l'image Docker et la publie sur
le registre GitHub (GHCR). Le VPS se contente de la télécharger et de la lancer,
derrière un reverse proxy Nginx qui gère le HTTPS.

```
GitHub (push sur main)
   └─ CI : tests + couverture
        └─ build de l'image → ghcr.io/eugeneleveque/strapi-mydsu:latest
             └─ Déploiement (manuel) : SSH → docker compose pull && up -d
                  └─ VPS : Nginx (443) → conteneur bondiz-api (127.0.0.1:1337)
                       └─ PostgreSQL Supabase + stockage Supabase
```

La base de données reste chez Supabase : le VPS n'héberge aucune donnée.

---

## 1. Préparer le VPS (une seule fois)

Connecte-toi en root, puis :

```bash
apt update && apt upgrade -y
```

### Un utilisateur dédié au déploiement

Ne jamais déployer en root :

```bash
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
```

(le groupe `docker` n'existera qu'après l'étape suivante — relance la commande si besoin)

### Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Pare-feu

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### Dossier de l'application

```bash
mkdir -p /opt/bondiz && chown deploy:deploy /opt/bondiz
```

---

## 2. Les secrets de production

Sur le VPS, crée `/opt/bondiz/.env` **à la main** (il ne doit jamais être dans
le dépôt) à partir de `.env.production.example`.

Génère chaque secret avec :

```bash
openssl rand -base64 32
```

Puis protège le fichier :

```bash
chmod 600 /opt/bondiz/.env && chown deploy:deploy /opt/bondiz/.env
```

---

## 3. La clé SSH de déploiement

Sur **ta machine**, crée une clé dédiée à GitHub Actions :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/bondiz_deploy -C "github-actions" -N ""
```

Installe la clé publique sur le VPS :

```bash
ssh-copy-id -i ~/.ssh/bondiz_deploy.pub deploy@TON_IP
```

### Secrets à créer dans GitHub

`Settings` → `Secrets and variables` → `Actions` :

| Secret | Valeur |
|---|---|
| `VPS_HOST` | l'adresse IP ou le domaine du VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | le contenu de `~/.ssh/bondiz_deploy` (la clé **privée**) |
| `VPS_PORT` | le port SSH, si ce n'est pas 22 |
| `VPS_KNOWN_HOSTS` | l'empreinte du serveur (voir ci-dessous) |
| `API_PUBLIC_URL` | `https://api.tondomaine.fr` |

### Épingler la clé du serveur

Le déploiement **refuse de démarrer** sans `VPS_KNOWN_HOSTS`. Sans cet
épinglage, le workflow accepterait la clé de n'importe quel serveur qui
répond à l'adresse, et une interception passerait inaperçue.

Relève l'empreinte **depuis un réseau de confiance** :

```bash
ssh-keyscan -H TON_IP
```

Compare-la à celle affichée par ton hébergeur ou par la console du serveur :

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Si les deux concordent, copie la sortie de `ssh-keyscan` dans le secret
`VPS_KNOWN_HOSTS`. À refaire si tu réinstalles le serveur, car ses clés
changent.

---

## 4. Accès à l'image

L'image est publiée sur `ghcr.io/eugeneleveque/strapi-mydsu`. Deux possibilités :

- **La rendre publique** (le plus simple) : page du dépôt → `Packages` →
  le paquet → `Package settings` → `Change visibility` → `Public`.
- **La garder privée** : créer un jeton d'accès personnel avec la permission
  `read:packages`, puis sur le VPS :

  ```bash
  echo "LE_JETON" | docker login ghcr.io -u TON_PSEUDO --password-stdin
  ```

---

## 5. Nginx et HTTPS

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Copie `deploy/nginx/bondiz-api.conf` dans `/etc/nginx/sites-available/bondiz-api`,
remplace `api.example.com` par ton domaine (dont l'enregistrement DNS doit déjà
pointer vers le VPS), puis :

```bash
ln -s /etc/nginx/sites-available/bondiz-api /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
```

Enfin, le certificat — certbot modifie la configuration et met en place le
renouvellement automatique :

```bash
certbot --nginx -d api.tondomaine.fr
```

---

## 6. Déployer

Onglet `Actions` → `Déploiement` → `Run workflow`. Laisse `latest`, ou indique
`sha-<commit>` pour déployer une version précise.

Le workflow copie `docker-compose.prod.yml`, télécharge l'image, redémarre le
conteneur, attend que la sonde de santé passe au vert, puis vérifie que
`/_health` répond depuis Internet. **Si l'API ne démarre pas, le workflow
échoue et affiche les 50 dernières lignes de journal.**

### Revenir en arrière

Relance le workflow avec l'étiquette d'une image précédente : `sha-<commit>`.
L'image est déjà construite, le retour prend quelques secondes.

### Commandes utiles sur le VPS

```bash
cd /opt/bondiz && docker compose -f docker-compose.prod.yml logs -f strapi
```

```bash
cd /opt/bondiz && docker compose -f docker-compose.prod.yml ps
```

---

## Stockage des photos

Aujourd'hui, les photos de profil sont écrites sur le disque, dans
`public/uploads`. Le volume `uploads` de `docker-compose.prod.yml` les conserve
d'un déploiement à l'autre — **sans lui, chaque mise à jour les effacerait**.

Deux conséquences :

- **à la migration vers un nouveau serveur**, copier les fichiers existants
  dans le volume, sinon les profils s'afficheront vides ;
- **ces fichiers ne sont pas sauvegardés** : Supabase sauvegarde la base, pas le
  disque du serveur.

Pour basculer plus tard sur Supabase Storage : créer un bucket public
`user_photos`, renseigner les variables `SUPABASE_*` du `.env`, puis migrer
l'existant (simulation d'abord, aucune écriture) :

```bash
node scripts/migrate-uploads-to-supabase.js
```

```bash
node scripts/migrate-uploads-to-supabase.js --apply
```

Le script doit tourner **là où sont les fichiers**, donc sur le serveur.

## Premier démarrage

Strapi applique les migrations de schéma au démarrage, sur la base Supabase.
**Fais une sauvegarde depuis l'interface Supabase avant le premier
déploiement**, et de préférence avant chaque déploiement qui touche aux schémas.

Il faudra aussi créer le premier administrateur, sur `https://api.tondomaine.fr/admin`,
ou en ligne de commande dans le conteneur :

```bash
docker exec -it bondiz-api npm run strapi admin:create-user
```
