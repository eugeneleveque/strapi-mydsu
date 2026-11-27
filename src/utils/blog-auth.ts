import crypto from 'crypto';
import { errors } from '@strapi/utils';

const { UnauthorizedError } = errors;

const MIN_LENGTH = 32;

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();

/**
 * Server-to-server calls from the blog admin, authenticated by the shared
 * secret BLOG_API_SECRET. Without a long enough secret, everything is refused.
 */
export const requireBlogSecret = (ctx): void => {
  const expected = process.env.BLOG_API_SECRET ?? '';
  const [scheme, token] = String(ctx.request.header.authorization ?? '').split(' ');

  const valid =
    expected.length >= MIN_LENGTH &&
    scheme?.toLowerCase() === 'bearer' &&
    Boolean(token) &&
    // Hashed first: timingSafeEqual needs two buffers of the same length.
    crypto.timingSafeEqual(digest(token), digest(expected));

  if (!valid) {
    throw new UnauthorizedError('Accès réservé à l’administration du blog.');
  }
};
