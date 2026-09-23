'use strict';

/**
 * Upload : un utilisateur ne peut envoyer que des images, sur son seul profil,
 * et ne peut pas remplacer un fichier existant.
 */

const { setupStrapi, stopStrapi } = require('../helpers/strapi');
const { api, createUser, createActivity, PNG_FIXTURE } = require('../helpers/factories');

jest.setTimeout(120000);

beforeAll(() => setupStrapi('upload'));
afterAll(() => stopStrapi());

/** Envoie un fichier, avec les champs de rattachement optionnels. */
function televerser(user, { fields = {}, mime = 'image/png', name = 'photo.png' } = {}) {
  const requete = api().post('/api/upload');

  if (user) {
    requete.set('Authorization', `Bearer ${user.jwt}`);
  }
  for (const [cle, valeur] of Object.entries(fields)) {
    requete.field(cle, String(valeur));
  }

  return requete.attach('files', PNG_FIXTURE, { filename: name, contentType: mime });
}

describe('Envoi de fichiers', () => {
  it('accepte une image envoyée par un utilisateur connecté', async () => {
    const user = await createUser();
    const res = await televerser(user);

    expect(res.status).toBe(201);
    expect(res.body[0].url).toEqual(expect.any(String));
  });

  it('accepte le rattachement à sa propre photo de profil', async () => {
    const user = await createUser();
    const res = await televerser(user, {
      fields: { ref: 'plugin::users-permissions.user', refId: user.id, field: 'self_image' },
    });

    expect(res.status).toBe(201);
  });

  it('refuse le rattachement au profil de quelqu’un d’autre', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const res = await televerser(alice, {
      fields: { ref: 'plugin::users-permissions.user', refId: bob.id, field: 'self_image' },
    });

    expect(res.status).toBe(403);
  });

  it('refuse le rattachement à un autre type de contenu', async () => {
    const user = await createUser();
    const activity = await createActivity();

    const res = await televerser(user, {
      fields: { ref: 'api::activity.activity', refId: activity.id, field: 'image' },
    });

    expect(res.status).toBe(403);
  });

  it('refuse un champ non autorisé sur son profil', async () => {
    const user = await createUser();
    const res = await televerser(user, {
      fields: { ref: 'plugin::users-permissions.user', refId: user.id, field: 'bio' },
    });

    expect(res.status).toBe(403);
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const user = await createUser();
    const res = await televerser(user, { mime: 'application/pdf', name: 'cv.pdf' });

    expect(res.status).toBe(400);
  });

  it('refuse un envoi anonyme', async () => {
    const res = await televerser(null);

    expect([401, 403]).toContain(res.status);
  });
});

describe('Remplacement de fichier', () => {
  it('refuse de remplacer le fichier d’un autre', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const envoye = await televerser(alice);
    const fichierId = envoye.body[0].id;

    const res = await api()
      .post(`/api/upload?id=${fichierId}`)
      .set('Authorization', `Bearer ${bob.jwt}`)
      .attach('files', PNG_FIXTURE, { filename: 'pirate.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
  });

  it('refuse aussi de remplacer son propre fichier (opération réservée à l’admin)', async () => {
    const alice = await createUser();
    const envoye = await televerser(alice);

    const res = await api()
      .post(`/api/upload?id=${envoye.body[0].id}`)
      .set('Authorization', `Bearer ${alice.jwt}`)
      .attach('files', PNG_FIXTURE, { filename: 'remplacement.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
  });
});
