import { errors } from '@strapi/utils';

const { ForbiddenError, UnauthorizedError, ValidationError } = errors;

/**
 * The upload route of the content API does not check who owns a file:
 * `POST /upload?id=X` replaces any file, and `ref`/`refId` attach an upload to
 * any entry. This restricts it to the authenticated user's own profile.
 */

// Relations an end user may fill through the upload route.
const ALLOWED_REFS: Record<string, string[]> = {
  'plugin::users-permissions.user': ['self_image'],
};

const ALLOWED_MIME_PREFIX = 'image/';

const asArray = (files: unknown) => (Array.isArray(files) ? files : files ? [files] : []);

const assertOwnUpload = (ctx) => {
  const userId = ctx.state?.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Vous devez être connecté pour envoyer un fichier.');
  }

  // Replacing or renaming an existing file is an admin operation.
  if (ctx.query?.id) {
    throw new ForbiddenError('Le remplacement d’un fichier existant n’est pas autorisé.');
  }

  const { ref, refId, field } = ctx.request?.body ?? {};
  if (ref) {
    const allowedFields = ALLOWED_REFS[ref];
    if (!allowedFields) {
      throw new ForbiddenError(`Impossible d’attacher un fichier à "${ref}".`);
    }
    if (!allowedFields.includes(field)) {
      throw new ForbiddenError(`Impossible d’attacher un fichier au champ "${field}".`);
    }
    if (String(refId) !== String(userId)) {
      throw new ForbiddenError('Vous ne pouvez envoyer un fichier que sur votre propre profil.');
    }
  }

  for (const file of asArray(ctx.request?.files?.files)) {
    const mime = file?.mimetype ?? file?.type;
    if (!mime || !String(mime).startsWith(ALLOWED_MIME_PREFIX)) {
      throw new ValidationError('Seules les images sont acceptées.');
    }
  }
};

export default (plugin) => {
  // The content-api controller is registered as a factory: wrap the object it builds.
  const createContentApi = plugin.controllers['content-api'];

  plugin.controllers['content-api'] = (...args: unknown[]) => {
    const controller =
      typeof createContentApi === 'function' ? (createContentApi as any)(...args) : createContentApi;
    const { upload } = controller;

    return {
      ...controller,
      async upload(ctx) {
        assertOwnUpload(ctx);
        // `upload` dispatches to this.uploadFiles / this.replaceFile.
        return upload.call(this, ctx);
      },
    };
  };

  return plugin;
};
