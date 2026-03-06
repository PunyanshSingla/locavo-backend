const cron = require('node-cron');
const Booking = require('../models/Booking');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Locavo <locavo@locavo.punyanshsingla.com>';

const cashfree = new Cashfree(CFEnvironment.SANDBOX, process.env.CASHFREE_APP_ID, process.env.CASHFREE_SECRET_KEY);
const CASHFREE_VERSION = '2023-08-01';

// ─── MED-05: Auto-cancel awaiting_payment bookings older than 24 hours ─────────
// Runs every hour. If a customer was accepted and invited to pay but never paid
// within 24 hours, auto-cancel the booking and free the slot.
async function cancelStaleBookings() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  const stale = await Booking.find({
    status: 'awaiting_payment',
    updatedAt: { $lt: cutoff },
  }).populate('customerId', 'name email');

  for (const booking of stale) {
    try {
      // If payment was somehow made, issue refund
      if (booking.paymentStatus === 'paid' && booking.paymentOrderId) {
        try {
          await Cashfree.PGOrderCreateRefund(CASHFREE_VERSION, booking.paymentOrderId, {
            refund_amount: booking.totalPrice,
            refund_id: `RFND_AUTO_${booking._id}_${Date.now()}`,
            refund_note: 'Auto-cancelled: payment window expired',
          });
          booking.paymentStatus = 'refunded';
        } catch (refErr) {
          console.error('[CRON] Refund failed during auto-cancel:', booking._id, refErr.message);
        }
      }

      // Free availability slot
      if (booking.slotId) {
        const { Availability } = require('../models/Availability');
        const dateStr = booking.scheduledDate.toISOString().split('T')[0];
        await Availability.findOneAndUpdate(
          { providerId: booking.providerId, date: dateStr, 'slots._id': booking.slotId },
          { $set: { 'slots.$.isBooked': false, 'slots.$.bookingId': null } }
        );
      }

      booking.status = 'cancelled';
      booking.rejectionReason = 'Auto-cancelled: payment not received within 24 hours';
      await booking.save();

      // Notify customer
      if (booking.customerId?.email) {
        resend.emails.send({
          from: FROM_EMAIL,
          to: booking.customerId.email,
          subject: 'Booking Cancelled — Payment Window Expired',
          html: `<p>Hi ${booking.customerId.name},</p>
                 <p>Your booking was auto-cancelled because payment was not completed within 24 hours of acceptance.</p>
                 <p>Please book again and complete payment promptly to secure your slot.</p>`,
        }).catch(() => {});
      }
      console.log(`[CRON] Auto-cancelled stale booking: ${booking._id}`);
    } catch (err) {
      console.error('[CRON] Failed to auto-cancel booking:', booking._id, err.message);
    }
  }

  if (stale.length > 0) {
    console.log(`[CRON] Auto-cancelled ${stale.length} stale awaiting_payment bookings`);
  }
}

// ─── MED-07: Auto-release payout if customer doesn't verify within 72 hours ───
// If the job is completed but customer hasn't verified/disputed in 72h,
// automatically accept and queue the payout.
async function autoReleasePayout() {
  // Inline require to avoid circular dependency
  const { dispatchPayoutWithRetry } = require('./bookingController');

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
  const pending = await Booking.find({
    status: 'completed',
    'completionVerification.status': 'pending',
    completedAt: { $lt: cutoff },
  });

  for (const booking of pending) {
    try {
      booking.completionVerification.status = 'accepted';
      booking.completionVerification.reason = 'Auto-approved: customer did not respond within 72 hours';
      booking.completionVerification.verifiedAt = new Date();
      booking.payoutStatus = 'pending';
      await booking.save();

      setImmediate(() => dispatchPayoutWithRetry(booking._id.toString(), 3));
      console.log(`[CRON] Auto-approved and queued payout for booking: ${booking._id}`);
    } catch (err) {
      console.error('[CRON] Failed to auto-release payout:', booking._id, err.message);
    }
  }

  if (pending.length > 0) {
    console.log(`[CRON] Auto-released ${pending.length} pending payouts`);
  }
}

/**
 * Starts all cron jobs. Call this once from server.js after DB connects.
 */
function startCronJobs() {
  // Every hour — check for stale awaiting_payment bookings (MED-05)
  cron.schedule('0 * * * *', () => {
    cancelStaleBookings().catch(err => console.error('[CRON] cancelStaleBookings error:', err));
  });

  // Every 6 hours — auto-release payout if customer hasn't verified (MED-07)
  cron.schedule('0 */6 * * *', () => {
    autoReleasePayout().catch(err => console.error('[CRON] autoReleasePayout error:', err));
  });

  console.log('[CRON] Booking maintenance jobs started');
}

module.exports = { startCronJobs };
