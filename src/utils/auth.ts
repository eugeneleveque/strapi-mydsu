import { errors } from '@strapi/utils';

const { UnauthorizedError, ValidationError } = errors;

/**
 * Returns the id of the user authenticated with a JWT.
 * Requests made with an API token (no end user) are rejected: business
 * routes must always know who is acting.
 */
export const requireUserId = (ctx): number => {
  const userId = ctx.state?.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Vous devez être connecté.');
  }
  return userId;
};

/**
 * Accepts a numeric id, a numeric string or an object `{ id }`.
 */
export const parseId = (value: unknown, field: string): number => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`Le champ "${field}" doit être un identifiant valide.`);
  }
  return id;
};

/**
 * Restricts a Strapi REST query to the documents matching `scope`,
 * while keeping the filters sent by the client.
 */
export const scopeQuery = (query: Record<string, any> = {}, scope: Record<string, any>) => {
  const { filters } = query;
  return {
    ...query,
    filters: filters ? { $and: [filters, scope] } : scope,
  };
};
