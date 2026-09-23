/**
 * Fields visible on another user's profile. Everything else (email, phone,
 * position, relations...) is only visible to the owner through /users/me.
 */
export const PUBLIC_PROFILE_FIELDS = [
  'id',
  'documentId',
  'username',
  'bio',
  'age',
  'city',
  'interests',
  'gender',
  'self_image',
];

export const pick = (object: Record<string, any>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));

const toPublicImage = (image: any) =>
  image && typeof image === 'object'
    ? pick(image, ['id', 'documentId', 'name', 'url', 'formats', 'width', 'height', 'mime'])
    : image;

/**
 * Keeps only the public fields of a user, and trims the media objects.
 */
export const toPublicProfile = (user: any) => {
  if (!user || typeof user !== 'object') {
    return user;
  }

  const profile = pick(user, PUBLIC_PROFILE_FIELDS);
  if (Array.isArray(profile.self_image)) {
    profile.self_image = profile.self_image.map(toPublicImage);
  } else if (profile.self_image) {
    profile.self_image = toPublicImage(profile.self_image);
  }
  return profile;
};
