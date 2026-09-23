/**
 * discover service
 *
 * Suggests profiles to like: everyone except yourself, the accounts you
 * already liked, and blocked accounts — with the usual dating filters.
 */

import { errors } from '@strapi/utils';
import { toPublicProfile } from '../../../utils/public-profile';

const { ValidationError } = errors;

const USER_UID = 'plugin::users-permissions.user';
const LIKE_UID = 'api::like.like';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111;

const toNumber = (value: unknown, field: string) => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`Le paramètre "${field}" doit être un nombre.`);
  }
  return parsed;
};

/**
 * Birth date bounds for an age range: someone aged `age` was born between
 * today - (age + 1) years (exclusive) and today - age years.
 */
const birthDateBounds = (minAge?: number, maxAge?: number) => {
  const bounds: { $gte?: string; $lte?: string } = {};
  const today = new Date();
  const shiftYears = (years: number) => {
    const date = new Date(today);
    date.setFullYear(date.getFullYear() - years);
    return date.toISOString().slice(0, 10);
  };

  if (maxAge !== undefined) bounds.$gte = shiftYears(maxAge + 1);
  if (minAge !== undefined) bounds.$lte = shiftYears(minAge);
  return bounds;
};

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

export default ({ strapi }) => ({
  async findCandidates(userId: number, query: Record<string, any> = {}) {
    const page = Math.max(1, toNumber(query.page, 'page') ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toNumber(query.pageSize, 'pageSize') ?? DEFAULT_PAGE_SIZE));
    const minAge = toNumber(query.minAge, 'minAge');
    const maxAge = toNumber(query.maxAge, 'maxAge');
    const radius = toNumber(query.radius, 'radius');

    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      throw new ValidationError('"minAge" ne peut pas être supérieur à "maxAge".');
    }

    const me = await strapi.db.query(USER_UID).findOne({
      where: { id: userId },
      select: ['id', 'latitude', 'longitude'],
    });

    const sentLikes = await strapi.db.query(LIKE_UID).findMany({
      where: { fromUser: { id: userId } },
      populate: { toUser: { select: ['id'] } },
    });
    const excludedIds = [userId, ...sentLikes.map((like) => like.toUser?.id).filter(Boolean)];

    const where: Record<string, any> = {
      id: { $notIn: excludedIds },
      $or: [{ blocked: false }, { blocked: { $null: true } }],
    };

    if (query.city) where.city = query.city;
    if (query.gender) where.gender = query.gender;

    if (minAge !== undefined || maxAge !== undefined) {
      where.age = birthDateBounds(minAge, maxAge);
    }

    // Bounding box first (indexable), exact distance is computed below.
    const originLat = toNumber(query.latitude, 'latitude') ?? me?.latitude;
    const originLon = toNumber(query.longitude, 'longitude') ?? me?.longitude;
    const useDistance = radius !== undefined && originLat != null && originLon != null;

    if (useDistance) {
      const latDelta = radius / KM_PER_DEGREE_LAT;
      const lonDelta = radius / (KM_PER_DEGREE_LAT * Math.max(0.01, Math.cos((originLat * Math.PI) / 180)));
      where.latitude = { $gte: originLat - latDelta, $lte: originLat + latDelta };
      where.longitude = { $gte: originLon - lonDelta, $lte: originLon + lonDelta };
    }

    const interests = typeof query.interests === 'string'
      ? query.interests.split(',').map((interest) => interest.trim()).filter(Boolean)
      : Array.isArray(query.interests)
        ? query.interests
        : [];

    // Interests are stored as JSON, which databases cannot filter portably:
    // fetch a wider page and filter in memory.
    const needsMemoryFilter = interests.length > 0 || useDistance;
    const fetchLimit = needsMemoryFilter ? pageSize * 5 : pageSize;
    const fetchOffset = needsMemoryFilter ? 0 : (page - 1) * pageSize;

    const users = await strapi.db.query(USER_UID).findMany({
      where,
      populate: { self_image: true },
      orderBy: { id: 'asc' },
      limit: fetchLimit,
      offset: fetchOffset,
    });

    let candidates = users.map((user) => {
      const profile: Record<string, any> = toPublicProfile(user);
      if (useDistance && user.latitude != null && user.longitude != null) {
        profile.distanceKm = Math.round(distanceKm(originLat, originLon, user.latitude, user.longitude) * 10) / 10;
      }
      return profile;
    });

    if (interests.length > 0) {
      candidates = candidates.filter((candidate) => {
        const theirs = Array.isArray(candidate.interests) ? candidate.interests : [];
        return interests.some((interest) => theirs.includes(interest));
      });
    }

    if (useDistance) {
      candidates = candidates
        .filter((candidate) => candidate.distanceKm !== undefined && candidate.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    const total = needsMemoryFilter
      ? candidates.length
      : await strapi.db.query(USER_UID).count({ where });

    const results = needsMemoryFilter
      ? candidates.slice((page - 1) * pageSize, page * pageSize)
      : candidates;

    return {
      results,
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  },
});
