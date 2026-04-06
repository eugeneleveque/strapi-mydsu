export default {
  async afterCreate(event) {
    const likeId = event.result?.id;
    if (!likeId) return;

    const like = await strapi.db.query('api::like.like').findOne({
      where: { id: likeId },
      populate: {
        fromUser: true,
        toUser: true,
      },
    });

    if (!like?.fromUser?.id || !like?.toUser?.id) return;
    if (like.fromUser.id === like.toUser.id) return;

    const reverseLike = await strapi.db.query('api::like.like').findOne({
      where: {
        fromUser: like.toUser.id,
        toUser: like.fromUser.id,
      },
    });

    if (!reverseLike) return;

    const user1Id = Math.min(like.fromUser.id, like.toUser.id);
    const user2Id = Math.max(like.fromUser.id, like.toUser.id);

    const existingMatch = await strapi.db.query('api::match.match').findOne({
      where: {
        user1: user1Id,
        user2: user2Id,
      },
    });

    if (!existingMatch) {
      await strapi.db.query('api::match.match').create({
        data: {
          user1: user1Id,
          user2: user2Id,
        },
      });
    }

    await strapi.db.query('api::like.like').update({
      where: { id: like.id },
      data: { state: 'accepted' },
    });

    await strapi.db.query('api::like.like').update({
      where: { id: reverseLike.id },
      data: { state: 'accepted' },
    });
  },
};