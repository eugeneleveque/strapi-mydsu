export default {
  async beforeCreate(event) {
    const { data } = event.params;
    
    let activityId = null;
    if (data.activity && data.activity.connect && data.activity.connect.length > 0) {
      activityId = data.activity.connect[0].documentId || data.activity.connect[0].id || data.activity.connect[0];
    }

    if (activityId) {
      // For cross-compatibility and to handle both ID types, let's use the Document Service correctly
      const activity = await strapi.documents('api::activity.activity').findOne({
        documentId: activityId,
      });
      if (activity) {
        data.activityName = activity.title;
      }
    }
  },

  async beforeUpdate(event) {
    const { data, where } = event.params;
    
    let activityId = null;
    
    // 1. Check for changes in data
    if (data.activity && data.activity.connect && data.activity.connect.length > 0) {
      activityId = data.activity.connect[0].documentId || data.activity.connect[0].id || data.activity.connect[0];
    }
    
    // 2. If not found, look up existing booking by ID (numeric or documentId)
    if (!activityId) {
      // In Strapi 5 lifecycles, WHERE often contains the numeric ID
      const booking = await strapi.db.query('api::booking.booking').findOne({
        where: where,
        populate: ['activity']
      });
      
      if (booking && booking.activity) {
        // We need the documentId of the activity to fetch it via Document Service, or just use what we have
        activityId = booking.activity.documentId || booking.activity.id;
      }
    }

    if (activityId) {
      // Use Document Service for the final title fetch as it handles localization/drafts better
      const activity = await strapi.documents('api::activity.activity').findOne({
        documentId: activityId,
      });
      if (activity) {
        data.activityName = activity.title;
      }
    }
  },
};
