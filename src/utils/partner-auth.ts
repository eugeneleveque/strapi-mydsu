import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { errors } from '@strapi/utils';

const { UnauthorizedError } = errors;

const TOKEN_TYPE = 'partner';
const TOKEN_TTL = '7d';

/**
 * Partner tokens are signed with their own key: a partner token must never be
 * accepted by users-permissions as a user token (ids would collide).
 * Without PARTNER_JWT_SECRET, the key is derived from the users JWT secret.
 */
const secret = (): string => {
  if (process.env.PARTNER_JWT_SECRET) {
    return process.env.PARTNER_JWT_SECRET;
  }
  const userSecret = strapi.config.get('plugin::users-permissions.jwtSecret') as string;
  return crypto.createHmac('sha256', userSecret).update('partner-portal').digest('hex');
};

export const issuePartnerToken = (partnerDocumentId: string): string =>
  jwt.sign({ type: TOKEN_TYPE, partner: partnerDocumentId }, secret(), { expiresIn: TOKEN_TTL });

/**
 * Returns the documentId of the partner authenticated by the Bearer token.
 */
export const requirePartnerDocumentId = (ctx): string => {
  const header: string = ctx.request.header.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedError('Vous devez être connecté en tant que partenaire.');
  }

  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (payload.type !== TOKEN_TYPE || typeof payload.partner !== 'string') {
      throw new Error('invalid payload');
    }
    return payload.partner;
  } catch {
    throw new UnauthorizedError('Session partenaire invalide ou expirée.');
  }
};
