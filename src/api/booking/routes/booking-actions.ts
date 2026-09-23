/**
 * Custom booking routes (group bookings).
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/bookings/:id/leave',
      handler: 'booking.leave',
    },
  ],
};
