export default {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data.sentAt) {
      data.sentAt = new Date();
    }
  },
};
