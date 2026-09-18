import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  // SUPABASE_* are the expected names; DATABASE_* are kept for backward compatibility.
  const supabaseUrl = env('SUPABASE_API_URL', env('DATABASE_API_URL'));

  // Without Supabase configuration (local dev, tests), files are stored in public/uploads.
  if (!supabaseUrl) {
    return {};
  }

  return {
    upload: {
      config: {
        provider: 'strapi-provider-upload-supabase-bucket',
        providerOptions: {
          apiUrl: supabaseUrl,
          apiKey: env('SUPABASE_API_KEY', env('DATABASE_API_KEY')),
          bucket: env('SUPABASE_BUCKET', env('DATABASE_BUCKET')),
          directory: env('SUPABASE_DIRECTORY', env('DATABASE_DIRECTORY')),
          publicFiles: env.bool('SUPABASE_PUBLIC_FILES', env.bool('DATABASE_PUBLIC_FILES', true)),
          signedUrlExpires: env.int('SUPABASE_SIGNED_URL_EXPIRES', env.int('DATABASE_SIGNED_URL_EXPIRES', 3600)),
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      },
    },
  };
};

export default config;
