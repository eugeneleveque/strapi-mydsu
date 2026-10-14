# syntax=docker/dockerfile:1

############################################
# 1. Build : compile le serveur TypeScript
#    et le panneau d'administration
############################################
FROM node:20-alpine AS build

# Outils nécessaires à la compilation des modules natifs (sharp).
RUN apk add --no-cache build-base python3 vips-dev

WORKDIR /opt/app

# Couche de dépendances séparée : elle n'est reconstruite
# que si package.json ou le lockfile changent.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
# `strapi build` produit dist/ (serveur compilé + admin).
# `npm prune` retire ensuite les dépendances de développement.
RUN npm run build && npm prune --omit=dev

############################################
# 2. Développement : rechargement à chaud
#    (utilisé par docker-compose.dev.yml)
############################################
FROM node:20-alpine AS dev

RUN apk add --no-cache build-base python3 vips-dev

ENV NODE_ENV=development
WORKDIR /opt/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 1337
CMD ["npm", "run", "develop"]

############################################
# 3. Production : image minimale
############################################
FROM node:20-alpine AS prod

# Seule la bibliothèque d'exécution de sharp est nécessaire ici.
RUN apk add --no-cache vips

ENV NODE_ENV=production
WORKDIR /opt/app

COPY --from=build --chown=node:node /opt/app/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/app/dist ./dist
COPY --from=build --chown=node:node /opt/app/public ./public
COPY --from=build --chown=node:node /opt/app/package.json ./package.json
# Sans tsconfig.json, Strapi croit que le projet est en JavaScript
# et cherche la configuration à la racine au lieu de dist/.
COPY --from=build --chown=node:node /opt/app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /opt/app/favicon.png ./favicon.png

# Strapi crée ces dossiers au démarrage : ils doivent appartenir à `node`,
# sinon le conteneur s'arrête sur une erreur de permission.
RUN mkdir -p /opt/app/database/migrations /opt/app/.tmp /opt/app/public/uploads \
    && chown -R node:node /opt/app

# Ne jamais tourner en root.
USER node

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:1337/_health || exit 1

CMD ["npm", "run", "start"]
