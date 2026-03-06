const Booking = require('../models/Booking');
const User = require('../models/User');
const WebhookEvent = require('../models/WebhookEvent');
const { Resend } = require('resend');
const crypto = require('crypto');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Locavo <locavo@locavo.punyanshsingla.com>';

// ─── CRIT-08: Booking payment webhook (server-to-server, signature-verified) ──
//
// @desc    Cashfree payment webhook for booking orders (BOOK_*)
// @route   POST /api/v1/payments/booking/webhook
// @access  Public (Cashfree only — verified by HMAC signature)
exports.bookingPaymentWebhook = async (req, res) => {
  // ✅ Always respond 200 quickly — Cashfree retries on non-200
  // Process everything after the response is sent is NOT safe here because
  // we need to verify first. We verify synchronously then respond.
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      console.warn('[WEBHOOK-BOOKING] Missing signature headers');
      return res.status(200).json({ success: false, message: 'Missing headers' });
    }

    // ✅ Verify HMAC signature — reject spoofed requests
    const expectedSig = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');

    if (signature !== expectedSig) {
      console.warn('[WEBHOOK-BOOKING] Signature mismatch — possible spoofed request');
      return res.status(200).json({ success: false, message: 'Invalid signature' });
    }

    const { data, type } = req.body;

    // Only process successful payments
    if (type !== 'PAYMENT_SUCCESS_WEBHOOK') {
      return res.status(200).json({ success: true, message: 'Event type ignored' });
    }

    const orderId = data?.order?.order_id;
    if (!orderId || !orderId.startsWith('BOOK_')) {
      return res.status(200).json({ success: true, message: 'Non-booking order — ignored' });
    }

    // ✅ MED-04: Idempotency — skip if already processed
    const alreadyProcessed = await WebhookEvent.exists({ orderId });
    if (alreadyProcessed) {
      console.log('[WEBHOOK-BOOKING] Already processed:', orderId);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // Record webhook processing (before DB changes — prevents double processing on retry)
    await WebhookEvent.create({ orderId, eventType: type });

    // Find the booking by paymentOrderId
    const booking = await Booking.findOne({ paymentOrderId: orderId })
      .populate('customerId', 'name email');

    if (!booking) {
      console.error('[WEBHOOK-BOOKING] No booking for orderId:', orderId);
      return res.status(200).json({ success: true, message: 'Booking not found — logged' });
    }

    // Guard: skip if already confirmed
    if (booking.status !== 'awaiting_payment') {
      return res.status(200).json({ success: true, message: 'Booking already processed' });
    }

    // Generate OTP, hash it only if status is awaiting_payment (atomic check)
    if (booking.status === 'awaiting_payment') {
      const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.workOtp = otpHash;
      booking.workOtpAttempts = 0;
      booking.workOtpExpire = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      booking.lastPaymentWebhookId = orderId;
      await booking.save();

      // Email OTP to customer
      resend.emails.send({
        from: FROM_EMAIL,
        to: booking.customerId.email,
        subject: '🔐 Your Work Start OTP — Locavo',
        html: `<p>Hi ${booking.customerId.name},</p>
               <p>Your payment was received and your booking is <strong>confirmed</strong>!</p>
               <p>Give this OTP to the provider when they arrive to start work:</p>
               <h2 style="font-size:32px;letter-spacing:8px;color:#1c8779;">${rawOtp}</h2>
               <p>Valid for <strong>30 minutes</strong>. Do not share until the provider is physically present.</p>`,
      }).catch(e => console.error('[WEBHOOK-BOOKING] OTP email failed:', e.message));

      console.log(`[WEBHOOK-BOOKING] Booking ${booking._id} confirmed via webhook`);
    } else {
      console.log(`[WEBHOOK-BOOKING] Booking ${booking._id} already confirmed via other source (polling), skipping OTP gen.`);
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[WEBHOOK-BOOKING] Error:', err);
    // Always 200 to prevent Cashfree retry storms
    res.status(200).json({ success: true, note: 'Internal error logged' });
  }
};
