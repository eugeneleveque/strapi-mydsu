import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  // SUPABASE_* are the expected names; DATABASE_* are kept for backward compatibility.
  const supabaseUrl = env('SUPABASE_API_URL', env('DATABASE_API_URL'));

  // 10 MB is plenty for profile pictures.
  const sizeLimit = env.int('UPLOAD_SIZE_LIMIT', 10 * 1024 * 1024);

  // Checked against the real file content, not only the declared type.
  // Partners may also attach PDF documents and videos.
  const security = {
    allowedTypes: ['image/*', 'video/*', 'application/pdf'],
    deniedTypes: ['image/svg+xml'],
  };

  // E-mails (mot de passe oublié) : envoyés par SMTP si SMTP_HOST est
  // renseigné. Sinon (dev, tests) nodemailer les construit sans les envoyer.
  const smtpHost = env('SMTP_HOST');
  const email = {
    config: {
      provider: 'nodemailer',
      providerOptions: smtpHost
        ? {
            host: smtpHost,
            port: env.int('SMTP_PORT', 587),
            secure: env.bool('SMTP_SECURE', false),
            auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') } : undefined,
          }
        : { jsonTransport: true },
      settings: {
        defaultFrom: env('EMAIL_FROM', 'Bondiz <no-reply@bondiz.fr>'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'bondizmydsu@gmail.com'),
      },
    },
  };

  // Without Supabase configuration (local dev, tests), files are stored in public/uploads.
  if (!supabaseUrl) {
    return { email, upload: { config: { sizeLimit, security } } };
  }

  return {
    email,
    upload: {
      config: {
        sizeLimit,
        security,
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
