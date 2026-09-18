/**
 * Keeps `activityName` in sync with the related activity, including for
 * bookings edited from the admin panel.
 */

const ACTIVITY_UID = 'api::activity.activity';
const BOOKING_UID = 'api::booking.booking';

// Relation payloads can be an id, a documentId, `{ id }`, `{ documentId }`,
// or `{ connect: [...] }` / `{ set: [...] }`.
const extractActivityRef = (value: any) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') return value;
  const list = value.connect ?? value.set;
  const entry = Array.isArray(list) ? list[0] : list ?? value;
  if (entry === undefined || entry === null) return null;
  return typeof entry === 'object' ? entry.id ?? entry.documentId ?? null : entry;
};

const findActivityTitle = async (ref: unknown) => {
  const where = typeof ref === 'number' || /^\d+$/.test(String(ref))
    ? { id: Number(ref) }
    : { documentId: String(ref) };
  const activity = await strapi.db.query(ACTIVITY_UID).findOne({ where, select: ['title'] });
  return activity?.title;
};

export default {
  async beforeCreate(event) {
    const { data } = event.params;
    const ref = extractActivityRef(data.activity);
    if (ref !== null) {
      const title = await findActivityTitle(ref);
      if (title) data.activityName = title;
    }
  },

  async beforeUpdate(event) {
    const { data, where } = event.params;
    let ref = extractActivityRef(data.activity);

    if (ref === null) {
      const booking = await strapi.db.query(BOOKING_UID).findOne({ where, populate: ['activity'] });
      ref = booking?.activity?.id ?? null;
    }

    if (ref !== null) {
      const title = await findActivityTitle(ref);
      if (title) data.activityName = title;
    }
  },
};
