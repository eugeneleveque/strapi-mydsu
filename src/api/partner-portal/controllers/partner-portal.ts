/**
 * partner-portal controller
 */

import { errors } from '@strapi/utils';
import { requirePartnerDocumentId } from '../../../utils/partner-auth';
import { listMessages, sendMessage } from '../../../utils/partner-messages';
import { addPhoto, getProfile, removePhoto, updateProfile } from '../../../utils/partner-profile';

const { UnauthorizedError, ValidationError } = errors;

const service = () => strapi.service('api::partner-portal.partner-portal');

/** documentId of the connected partner, refused once the account is disabled. */
const activePartner = async (ctx): Promise<string> => {
  const documentId = requirePartnerDocumentId(ctx);
  await service().getPartner(documentId);
  return documentId;
};

/**
 * Strapi's authorize middleware replaces any UnauthorizedError thrown by a
 * controller with a bare "Unauthorized". The blog shows these messages to the
 * partner (wrong password, disabled account...), so the 401 is written here.
 */
const keepUnauthorizedMessage = (controller: Record<string, (ctx) => Promise<void>>) =>
  Object.fromEntries(
    Object.entries(controller).map(([name, action]) => [
      name,
      async (ctx) => {
        try {
          await action(ctx);
        } catch (error) {
          if (!(error instanceof UnauthorizedError)) throw error;
          ctx.status = 401;
          ctx.body = { data: null, error: { status: 401, name: error.name, message: error.message, details: {} } };
        }
      },
    ])
  );

export default () => keepUnauthorizedMessage({
  async login(ctx) {
    const { email, password } = ctx.request.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw new ValidationError('Email et mot de passe requis.');
    }

    ctx.body = await service().login(email.trim(), password);
  },

  async me(ctx) {
    const partner = await service().getPartner(requirePartnerDocumentId(ctx));
    ctx.body = { data: partner };
  },

  async findActivities(ctx) {
    const activities = await service().findActivities(requirePartnerDocumentId(ctx));
    ctx.body = { data: activities };
  },

  async findActivity(ctx) {
    const activity = await service().findActivity(requirePartnerDocumentId(ctx), ctx.params.id);
    ctx.body = { data: activity };
  },

  async createActivity(ctx) {
    const partnerId = requirePartnerDocumentId(ctx);
    const activity = await service().createActivity(partnerId, ctx.request.body?.data);
    ctx.status = 201;
    ctx.body = { data: activity };
  },

  async updateActivity(ctx) {
    const partnerId = requirePartnerDocumentId(ctx);
    const activity = await service().updateActivity(partnerId, ctx.params.id, ctx.request.body?.data);
    ctx.body = { data: activity };
  },

  async deleteActivity(ctx) {
    await service().deleteActivity(requirePartnerDocumentId(ctx), ctx.params.id);
    ctx.status = 204;
  },

  async profile(ctx) {
    ctx.body = { data: await getProfile(await activePartner(ctx)) };
  },

  async updateProfile(ctx) {
    ctx.body = { data: await updateProfile(await activePartner(ctx), ctx.request.body?.data) };
  },

  async addPhoto(ctx) {
    const documentId = await activePartner(ctx);
    ctx.status = 201;
    ctx.body = { data: await addPhoto(documentId, ctx.request.files?.photo) };
  },

  async removePhoto(ctx) {
    ctx.body = { data: await removePhoto(await activePartner(ctx), Number(ctx.params.id)) };
  },

  async findMessages(ctx) {
    ctx.body = { data: await listMessages(await activePartner(ctx), 'partner') };
  },

  async sendMessage(ctx) {
    const documentId = await activePartner(ctx);
    ctx.status = 201;
    ctx.body = { data: await sendMessage(documentId, 'partner', ctx.request.body?.data?.content) };
  },
});
