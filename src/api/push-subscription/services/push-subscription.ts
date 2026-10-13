/**
 * push-subscription service
 *
 * Web Push: stores the browser subscriptions of each user and sends them
 * notifications. Disabled (every send is a no-op) until the VAPID keys are
 * set in the environment.
 */

import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import webpush from 'web-push';

const { ValidationError } = errors;

const PUSH_UID = 'api::push-subscription.push-subscription';

// The server posts to the endpoint given by the client: only accept the push
// services of the browsers, never an arbitrary URL.
const ALLOWED_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];

const MAX_ENDPOINT_LENGTH = 2000;
const MAX_KEY_LENGTH = 255;
const MAX_BODY_LENGTH = 140;

// A notification nobody could receive within a day is no longer useful.
const TTL_SECONDS = 24 * 60 * 60;

export type PushPayload = {
  title: string;
  body: string;
  /** Path opened in the app when the notification is clicked. */
  url?: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
};

type StoredSubscription = { id: number; endpoint: string; p256dh: string; auth: string };

const isAllowedHost = (hostname: string) =>
  ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export default factories.createCoreService(PUSH_UID, ({ strapi }) => ({
  vapid() {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null;
    return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT };
  },

  isEnabled() {
    return this.vapid() !== null;
  },

  publicKey(): string | null {
    return this.vapid()?.publicKey ?? null;
  },

  /**
   * Checks the subscription sent by the browser (`PushSubscription.toJSON()`).
   */
  validateSubscription(input: any) {
    const endpoint = typeof input?.endpoint === 'string' ? input.endpoint.trim() : '';
    const p256dh = input?.keys?.p256dh;
    const auth = input?.keys?.auth;

    let url: URL | null = null;
    try {
      url = new URL(endpoint);
    } catch {
      url = null;
    }

    if (!url || url.protocol !== 'https:' || !isAllowedHost(url.hostname) || endpoint.length > MAX_ENDPOINT_LENGTH) {
      throw new ValidationError('L’abonnement aux notifications est invalide.');
    }

    const isKey = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH;
    if (!isKey(p256dh) || !isKey(auth)) {
      throw new ValidationError('Les clés de l’abonnement sont invalides.');
    }

    return { endpoint, p256dh: p256dh as string, auth: auth as string };
  },

  /**
   * Saves the subscription of a browser. An endpoint belongs to one browser:
   * if another account used it before, it is handed over to the current user.
   */
  async subscribe(userId: number, input: unknown) {
    const { endpoint, p256dh, auth } = this.validateSubscription(input);

    const existing = await strapi.db.query(PUSH_UID).findOne({ where: { endpoint } });
    if (existing) {
      return strapi.db.query(PUSH_UID).update({
        where: { id: existing.id },
        data: { p256dh, auth, user: userId },
      });
    }

    return strapi.db.query(PUSH_UID).create({ data: { endpoint, p256dh, auth, user: userId } });
  },

  /**
   * Removes one subscription of the user. Returns the number of rows removed.
   */
  async unsubscribe(userId: number, endpoint: unknown) {
    if (typeof endpoint !== 'string' || !endpoint) {
      throw new ValidationError('Le champ "endpoint" est requis.');
    }
    return this.remove({ endpoint, user: { id: userId } });
  },

  async removeAllForUser(userId: number) {
    return this.remove({ user: { id: userId } });
  },

  async remove(where: Record<string, any>) {
    const subscriptions = await strapi.db.query(PUSH_UID).findMany({ where, select: ['id'] });
    if (subscriptions.length === 0) return 0;

    await strapi.db.query(PUSH_UID).deleteMany({
      where: { id: { $in: subscriptions.map((subscription) => subscription.id) } },
    });
    return subscriptions.length;
  },

  /**
   * Sends one notification to one browser. Kept apart so the tests can
   * replace the network call.
   */
  async deliver(subscription: StoredSubscription, payload: PushPayload) {
    const vapid = this.vapid();
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: TTL_SECONDS }
    );
  },

  /**
   * Notifies every browser of a user. Subscriptions the push service reports
   * as gone (404 / 410) are deleted.
   */
  async notifyUser(userId: number, payload: PushPayload) {
    if (!this.isEnabled()) return { sent: 0, removed: 0 };

    const subscriptions: StoredSubscription[] = await strapi.db
      .query(PUSH_UID)
      .findMany({ where: { user: { id: userId } } });

    const message = { ...payload, body: truncate(payload.body, MAX_BODY_LENGTH) };
    const expired: number[] = [];
    let sent = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await this.deliver(subscription, message);
          sent += 1;
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            expired.push(subscription.id);
          } else {
            strapi.log.warn(`[push] Envoi impossible (${error?.statusCode ?? error?.message}).`);
          }
        }
      })
    );

    if (expired.length > 0) {
      await strapi.db.query(PUSH_UID).deleteMany({ where: { id: { $in: expired } } });
    }

    return { sent, removed: expired.length };
  },

  /**
   * Same as `notifyUser`, without making the caller wait for the push
   * services: a notification must never slow down or fail an API request.
   */
  notifyUserInBackground(userId: number, payload: PushPayload) {
    if (!this.isEnabled()) return;

    this.notifyUser(userId, payload).catch((error) => {
      strapi.log.error(`[push] ${error?.message ?? error}`);
    });
  },
}));
