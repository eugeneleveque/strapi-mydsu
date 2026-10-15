import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Public URL (https://api.example.com) used for admin links and secure cookies.
  url: env('PUBLIC_URL', ''),
  // Behind Nginx, trust X-Forwarded-* so Strapi knows the request came over HTTPS.
  proxy: { koa: env.bool('IS_PROXIED', env('NODE_ENV') === 'production') },
  app: {
    keys: env.array('APP_KEYS'),
  },
});

export default config;
