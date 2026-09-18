import type { UID } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { scopeQuery } from './auth';

const { NotFoundError } = errors;

/**
 * Helpers used by the core controllers to only expose documents the current
 * user is allowed to see.
 *
 * The scope is added AFTER Strapi's query sanitization so that it can never be
 * stripped (e.g. filters on relations to users removed by the sanitizer).
 */

export const scopedFind = async (controller, ctx, uid: UID.ContentType, scope: Record<string, any>) => {
  await controller.validateQuery(ctx);
  const sanitizedQuery = await controller.sanitizeQuery(ctx);

  const { results, pagination } = await strapi.service(uid).find(scopeQuery(sanitizedQuery, scope));
  const sanitizedResults = await controller.sanitizeOutput(results, ctx);

  return controller.transformResponse(sanitizedResults, { pagination });
};

export const scopedFindOne = async (controller, ctx, uid: UID.ContentType, scope: Record<string, any>) => {
  await controller.validateQuery(ctx);
  const sanitizedQuery = await controller.sanitizeQuery(ctx);

  const entity = await findScoped(uid, ctx.params.id, scope, sanitizedQuery);
  if (!entity) {
    return ctx.notFound();
  }

  const sanitizedEntity = await controller.sanitizeOutput(entity, ctx);
  return controller.transformResponse(sanitizedEntity);
};

/**
 * Finds a document by documentId, only if it matches `scope`.
 */
export const findScoped = async (
  uid: UID.ContentType,
  documentId: string,
  scope: Record<string, any>,
  query: Record<string, any> = {}
) => {
  const { results } = await strapi.service(uid).find({
    ...scopeQuery(query, { $and: [{ documentId }, scope] }),
    pagination: { page: 1, pageSize: 1 },
  });
  return results[0] ?? null;
};

export const findScopedOrThrow = async (
  uid: UID.ContentType,
  documentId: string,
  scope: Record<string, any>,
  query: Record<string, any> = {}
) => {
  const entity = await findScoped(uid, documentId, scope, query);
  if (!entity) {
    throw new NotFoundError('Ressource introuvable.');
  }
  return entity;
};
