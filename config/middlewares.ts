import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  // Images stored in Supabase Storage must be allowed by the admin panel CSP,
  // otherwise Media Library thumbnails are blocked.
  const supabaseUrl = env('SUPABASE_API_URL', env('DATABASE_API_URL', ''));
  const mediaSources = ["'self'", 'data:', 'blob:', ...(supabaseUrl ? [new URL(supabaseUrl).origin] : [])];

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:'],
            'img-src': [...mediaSources, 'market-assets.strapi.io'],
            'media-src': mediaSources,
            upgradeInsecureRequests: null,
          },
        },
      },
    },
    'strapi::cors',
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};

export default config;
