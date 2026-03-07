const Booking = require('../models/Booking');
const User = require('../models/User');
const Service = require('../models/Service');
const Quote = require('../models/Quote');
const Availability = require('../models/Availability');
const { Resend } = require('resend');
const crypto = require('crypto');
const axios = require('axios');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const { decrypt } = require('../utils/encryption'); // MED-03
const dotenv = require('dotenv');
dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Locavo <locavo@locavo.punyanshsingla.com>';
const CASHFREE_VERSION = '2023-08-01';

// ── Init Cashfree (static, done once at module load) ─────────────────────────
const cashfree = new Cashfree(CFEnvironment.SANDBOX, process.env.CASHFREE_APP_ID, process.env.CASHFREE_SECRET_KEY);

// ─── Helper ──────────────────────────────────────────────────────────────────
const populateBooking = (query) =>
  query
    .populate('serviceId', 'title basePrice durationMinutes')
    .populate('customerId', 'name profilePicture phone email')
    .populate('providerId', 'name profilePicture phone email providerDetails');

// @desc    Create a new booking (customer)
// @route   POST /api/v1/bookings
// @access  Private (Customer)
exports.createBooking = async (req, res) => {
  try {
    // ✅ CRIT-07: totalPrice is NOT accepted from client — derived server-side from service
    const { providerId, serviceId, scheduledDate, slotId, serviceAddress, specialInstructions, customerImages } = req.body;

    if (!providerId || !serviceId || !scheduledDate || !serviceAddress) {
      return res.status(400).json({ success: false, error: 'Please provide all required booking details' });
    }

    // Verify provider is approved
    const provider = await User.findOne({ _id: providerId, role: 'provider', 'providerDetails.isApproved': true });
    if (!provider) return res.status(404).json({ success: false, error: 'Provider not found or not approved' });

    // Verify service belongs to provider — price comes from DB, not client
    const service = await Service.findOne({ _id: serviceId, providerId, isActive: true });
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

    // ✅ Server-authoritative pricing
    const basePrice = service.basePrice;
    const totalPrice = parseFloat((basePrice * 1.025).toFixed(2)); // Customer pays 2.5% extra
    const platformFee = parseFloat((basePrice * 0.05).toFixed(2)); // Total 5% cut (2.5% from customer + 2.5% from base)
    const providerPayout = parseFloat((basePrice * 0.975).toFixed(2)); // Provider gets base - 2.5%

    // ✅ CRIT-02: Atomic slot booking — no race condition
    if (slotId) {
      const dateStr = new Date(scheduledDate).toISOString().split('T')[0];
      const slotResult = await Availability.findOneAndUpdate(
        { providerId, date: dateStr, 'slots._id': slotId, 'slots.isBooked': false },
        { $set: { 'slots.$.isBooked': true } },
        { new: true }
      );
      if (!slotResult) {
        return res.status(409).json({ success: false, error: 'This slot was just booked by someone else. Please choose another time.' });
      }
    }

    const booking = await Booking.create({
      customerId: req.user.id,
      providerId,
      serviceId,
      scheduledDate: new Date(scheduledDate),
      slotId: slotId || null,
      serviceAddress,
      totalPrice,
      specialInstructions,
      customerImages: customerImages || [],
      platformFee,
      providerPayout,
    });

    // Notify provider via email (fire-and-forget — non-critical)
    resend.emails.send({
      from: FROM_EMAIL,
      to: provider.email,
      subject: 'New Booking Request — Locavo',
      html: `<p>Hi ${provider.name},</p>
             <p>You have a new booking request from <strong>${req.user.name || 'a customer'}</strong> for <strong>${service.title}</strong>.</p>
             <p>Please log in to your dashboard to review and accept or reject it.</p>`,
    }).catch(e => console.error('Email send failed:', e.message));

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    console.error('createBooking error:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get bookings for the logged-in user
// @route   GET /api/v1/bookings
// @access  Private
exports.getMyBookings = async (req, res) => {
  try {
    const filter = req.user.role === 'provider'
      ? { providerId: req.user.id }
      : { customerId: req.user.id };

    if (req.query.status) filter.status = req.query.status;

    const bookings = await populateBooking(Booking.find(filter).sort({ createdAt: -1 })).lean();

    // Attach 'isReviewed' boolean to each booking (especially relevant for completed bookings)
    const Review = require('../models/Review');
    const bookingsWithReviewStatus = await Promise.all(
      bookings.map(async (b) => {
        if (b.status === 'completed') {
          const exists = await Review.exists({ bookingId: b._id });
          return { ...b, isReviewed: !!exists };
        }
        return { ...b, isReviewed: false };
      })
    );

    res.status(200).json({ success: true, count: bookingsWithReviewStatus.length, data: bookingsWithReviewStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider accepts a booking → generates Cashfree payment order
// @route   PUT /api/v1/bookings/:id/accept
// @access  Private (Provider)
exports.acceptBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('customerId', 'name email phone');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status !== 'pending') return res.status(400).json({ success: false, error: 'Booking is not in pending state' });

    // Create Cashfree order for customer to pay
    const orderId = `BOOK_${booking._id}_${Date.now()}`;
    const customer = booking.customerId;

    const orderRequest = {
      order_id: orderId,
      order_amount: booking.totalPrice,
      order_currency: 'INR',
      customer_details: {
        customer_id: customer._id.toString(),
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: '+919090407368',
      },
      order_note: `Booking payment for service`,
    };
    const cfRes = await cashfree.PGCreateOrder(orderRequest);
    const paymentSessionId = cfRes?.data?.payment_session_id;

    booking.status = 'awaiting_payment';
    booking.paymentOrderId = orderId;
    booking.paymentSessionId = paymentSessionId || null; // ← stored so frontend can re-open payment
    booking.acceptedAt = new Date();
    await booking.save();

    // Email customer to pay
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: customer.email,
        subject: 'Your booking is accepted — Please pay to confirm',
        html: `<p>Hi ${customer.name},</p>
               <p>Your booking has been <strong>accepted</strong>! Please complete the payment to confirm your appointment.</p>
               <p>Go to your bookings page to complete payment.</p>`,
      });
    } catch (_) { }

    res.status(200).json({ success: true, data: { booking, paymentSessionId, orderId } });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider rejects a booking
// @route   PUT /api/v1/bookings/:id/reject
// @access  Private (Provider)
exports.rejectBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('customerId', 'name email');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: 'Not authorized' });
    if (!['pending', 'awaiting_payment'].includes(booking.status))
      return res.status(400).json({ success: false, error: 'Cannot reject at this stage' });

    // ✅ CRIT-06: If customer already paid, initiate a refund before rejecting
    if (booking.paymentStatus === 'paid' && booking.paymentOrderId) {
      try {
        await Cashfree.PGOrderCreateRefund(CASHFREE_VERSION, booking.paymentOrderId, {
          refund_amount: booking.totalPrice,
          refund_id: `RFND_${booking._id}_${Date.now()}`,
          refund_note: 'Provider cancelled the booking',
        });
        booking.paymentStatus = 'refunded';
        console.log(`Refund initiated for booking ${booking._id}`);
      } catch (refundErr) {
        // Log and FAIL rejection — do not leave customer in the dark
        console.error('Refund failed for booking', booking._id, refundErr?.response?.data || refundErr.message);
        return res.status(500).json({
          success: false,
          error: 'Refund initiation failed. Rejection aborted to prevent financial loss. Please contact support.',
          detail: refundErr?.response?.data || refundErr.message
        });
      }
    }

    booking.status = 'rejected';
    booking.rejectionReason = req.body.reason || null;
    await booking.save();

    // Free up slot atomically
    if (booking.slotId) {
      const dateStr = booking.scheduledDate.toISOString().split('T')[0];
      await Availability.findOneAndUpdate(
        { providerId: req.user.id, date: dateStr, 'slots._id': booking.slotId },
        { $set: { 'slots.$.isBooked': false, 'slots.$.bookingId': null } }
      );
    }

    resend.emails.send({
      from: FROM_EMAIL,
      to: booking.customerId.email,
      subject: 'Booking Update — Locavo',
      html: `<p>Hi ${booking.customerId.name},</p>
             <p>Your booking request has been declined by the provider.</p>
             ${booking.rejectionReason ? `<p>Reason: ${booking.rejectionReason}</p>` : ''}
             ${booking.paymentStatus === 'refunded' ? '<p>Your payment will be refunded within 5-7 business days.</p>' : ''}
             <p>Please try booking another provider.</p>`,
    }).catch(e => console.error('Email failed:', e.message));

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    console.error('rejectBooking error:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};


// @desc    Confirm payment — called after Cashfree webhook/frontend confirmation
// @route   PUT /api/v1/bookings/:id/confirm-payment
// @access  Private (Customer)
exports.confirmPayment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('customerId', 'name email');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.customerId._id.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status === 'confirmed') {
      return res.status(200).json({ success: true, message: 'Payment already confirmed.' });
    }
    if (booking.status !== 'awaiting_payment') {
      return res.status(400).json({ success: false, error: 'Booking is not in a payable state.' });
    }
    if (!booking.paymentOrderId)
      return res.status(400).json({ success: false, error: 'No payment order on record for this booking' });

    // ✅ CRIT-01: Verify payment with Cashfree BEFORE trusting it
    let cfOrder;
    try {
      cfOrder = await cashfree.PGFetchOrder(booking.paymentOrderId);
    } catch (cfErr) {
      console.error('Cashfree order fetch failed:', cfErr?.response?.data || cfErr.message);
      return res.status(502).json({ success: false, error: 'Could not verify payment status. Please try again.' });
    }
    if (cfOrder?.data?.order_status !== 'PAID') {
      return res.status(402).json({
        success: false,
        error: 'Payment has not been completed. Please complete payment first.',
        paymentStatus: cfOrder?.data?.order_status,
      });
    }

    // ✅ CRIT-03: Hash OTP — never store plaintext in DB
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    booking.workOtp = otpHash;  // stored as hash
    booking.workOtpExpire = new Date(Date.now() + 30 * 60 * 1000);
    await booking.save();

    // Send RAW otp only via email — never return in API response
    resend.emails.send({
      from: FROM_EMAIL,
      to: booking.customerId.email,
      subject: '🔐 Your Work Start OTP — Locavo',
      html: `<p>Hi ${booking.customerId.name},</p>
             <p>Your booking is <strong>confirmed</strong>! Your provider will ask for this OTP when they arrive to start the work.</p>
             <h2 style="font-size:32px;letter-spacing:8px;color:#1c8779;">${rawOtp}</h2>
             <p>This OTP is valid for <strong>30 minutes</strong>. Do not share it until the provider is physically present.</p>`,
    }).catch(e => console.error('OTP email failed:', e.message));

    res.status(200).json({ success: true, message: 'Payment verified. OTP sent to your email.' });
  } catch (err) {
    console.error('confirmPayment error:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider enters OTP + GPS to start work
// @route   PUT /api/v1/bookings/:id/start
// @access  Private (Provider)
exports.startWork = async (req, res) => {
  try {
    const { otp, lat, lng } = req.body;
    if (!otp) return res.status(400).json({ success: false, error: 'OTP is required' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status !== 'confirmed') return res.status(400).json({ success: false, error: 'Booking is not confirmed yet' });

    // ✅ MED-01: OTP brute-force protection — max 5 wrong attempts then invalidate
    const MAX_OTP_ATTEMPTS = 5;
    if (booking.workOtpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed OTP attempts. OTP has been invalidated. The customer must request a new one.'
      });
    }
    if (booking.workOtpExpire < new Date()) {
      return res.status(400).json({ success: false, error: 'OTP has expired. The customer must request a new one.' });
    }
    const incomingHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (!booking.workOtp || incomingHash !== booking.workOtp) {
      // Increment attempt counter atomically
      await Booking.findByIdAndUpdate(booking._id, { $inc: { workOtpAttempts: 1 } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - (booking.workOtpAttempts + 1);
      return res.status(400).json({
        success: false,
        error: `Invalid OTP. ${attemptsLeft > 0 ? attemptsLeft + ' attempts remaining.' : 'OTP invalidated.'}`,
      });
    }

    booking.status = 'in_progress';
    booking.startedAt = new Date();
    booking.workOtp = null;
    booking.workOtpExpire = null;
    if (lat && lng) {
      booking.providerLocation = { lat: parseFloat(lat), lng: parseFloat(lng), capturedAt: new Date() };
    }
    await booking.save();

    res.status(200).json({ success: true, message: 'Work started!', data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider uploads before/after images
// @route   PUT /api/v1/bookings/:id/images
// @access  Private (Provider)
exports.uploadJobImages = async (req, res) => {
  try {
    const { type, urls } = req.body; // type: 'before' | 'after', urls: string[]
    if (!type || !['before', 'after'].includes(type) || !Array.isArray(urls)) {
      return res.status(400).json({ success: false, error: "type ('before'|'after') and urls array required" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status !== 'in_progress') return res.status(400).json({ success: false, error: 'Job is not in progress' });

    booking.jobImages[type].push(...urls);
    await booking.save();

    res.status(200).json({ success: true, data: booking.jobImages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider updates work notes
// @route   PUT /api/v1/bookings/:id/notes
// @access  Private (Provider)
exports.updateWorkNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (!['in_progress', 'completed'].includes(booking.status)) return res.status(400).json({ success: false, error: 'Job is not in progress or completed' });

    booking.workNotes = notes;
    await booking.save();

    res.status(200).json({ success: true, data: booking.workNotes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider marks job as complete
// @route   PUT /api/v1/bookings/:id/complete
// @access  Private (Provider)
exports.markComplete = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('customerId', 'name email');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status !== 'in_progress') return res.status(400).json({ success: false, error: 'Job is not in progress' });

    booking.status = 'completed';
    booking.completedAt = new Date();
    booking.completionVerification = { status: 'pending', reason: null, disputeVideo: null, verifiedAt: null };
    await booking.save();

    // Notify customer to verify
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: booking.customerId.email,
        subject: 'Service Completed — Please Verify on Locavo',
        html: `<p>Hi ${booking.customerId.name},</p>
               <p>The provider has marked your job as <strong>complete</strong>. Please log in and verify whether the work is satisfactory.</p>
               <p>If satisfied, approve it — this will release payment to the provider. If not, you can raise a dispute.</p>`,
      });
    } catch (_) { }

    res.status(200).json({ success: true, message: 'Job marked complete. Customer notified.', data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Customer verifies completion or raises dispute
// @route   PUT /api/v1/bookings/:id/verify
// @access  Private (Customer)
exports.verifyCompletion = async (req, res) => {
  try {
    const { accepted, reason, disputeVideo, disputeImages } = req.body;
    const booking = await Booking.findById(req.params.id).populate('providerId', 'name email providerDetails');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.status !== 'completed') return res.status(400).json({ success: false, error: 'Job is not marked complete yet' });
    if (booking.completionVerification?.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Already verified' });
    }

    booking.completionVerification.status = accepted ? 'accepted' : 'rejected';
    booking.completionVerification.reason = reason || null;
    booking.completionVerification.disputeVideo = disputeVideo || null;
    booking.completionVerification.disputeImages = disputeImages || [];
    booking.completionVerification.verifiedAt = new Date();

    if (accepted) {
      // ✅ CRIT-04: Payout is ASYNC — not blocking the HTTP response
      // Mark as pending, fire-and-forget, the payout function updates DB when done
      booking.payoutStatus = 'pending';
      await booking.save();

      // Fire and forget with retry
      setImmediate(() => dispatchPayoutWithRetry(booking._id.toString(), 3));

      return res.status(200).json({
        success: true,
        message: 'Work verified! Payment is being released to the provider.',
      });
    }

    await booking.save();
    res.status(200).json({
      success: true,
      message: 'Dispute recorded. Our team will review within 48 hours.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider responds to a dispute
// @route   PUT /api/v1/bookings/:id/dispute-response
// @access  Private (Provider)
exports.respondToDispute = async (req, res) => {
  try {
    const { responseType, message } = req.body;
    if (!responseType || !['clarify', 'revisit'].includes(responseType)) {
      return res.status(400).json({ success: false, error: 'Valid responseType (clarify|revisit) is required' });
    }

    const booking = await Booking.findById(req.params.id).populate('customerId', 'name email');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.providerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (booking.completionVerification?.status !== 'rejected') {
      return res.status(400).json({ success: false, error: 'No active dispute to respond to' });
    }

    booking.completionVerification.providerResponse = {
      type: responseType,
      message: message || null,
      respondedAt: new Date(),
    };

    if (responseType === 'revisit') {
      // Set status back to in_progress so the "same cycle" happens
      booking.status = 'in_progress';
      // We don't clear the dispute data, we keep it as history, 
      // but the provider can now upload new images and mark complete again.
      // Reset verification status to pending for the NEXT time they mark complete
      booking.completionVerification.status = 'pending'; 
    }

    await booking.save();

    // Notify customer
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: booking.customerId.email,
        subject: `Provider Response to Dispute — Locavo`,
        html: `<p>Hi ${booking.customerId.name},</p>
               <p>The provider has responded to your dispute for booking <strong>#${booking._id}</strong>.</p>
               <p><strong>Response Type:</strong> ${responseType === 'revisit' ? 'Offer to Revisit & Fix' : 'Clarification'}</p>
               ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
               <p>Please log in to your dashboard to view details.</p>`,
      });
    } catch (_) {}

    res.status(200).json({ success: true, message: 'Response recorded', data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Customer cancels a booking
// @route   PUT /api/v1/bookings/:id/cancel
// @access  Private (Customer)
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });

    // User Rule: can't cancel if payment is already done or work has started
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, error: 'Cannot cancel this booking after payment is completed' });
    }

    if (['cancelled', 'completed', 'rejected', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({ success: false, error: `Cannot cancel a ${booking.status} booking` });
    }

    // Release the slot if applicable
    if (booking.slotId) {
      const dateStr = new Date(booking.scheduledDate).toISOString().split('T')[0];
      await Availability.findOneAndUpdate(
        { providerId: booking.providerId, date: dateStr, 'slots._id': booking.slotId },
        { $set: { 'slots.$.isBooked': false } }
      );
    }

    booking.status = 'cancelled';
    await booking.save();

    res.status(200).json({ success: true, message: 'Booking cancelled successfully', data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Customer reschedules a booking
// @route   PUT /api/v1/bookings/:id/reschedule
// @access  Private (Customer)
exports.rescheduleBooking = async (req, res) => {
  try {
    const { newDate, newSlotId } = req.body;
    if (!newDate || !newSlotId) {
      return res.status(400).json({ success: false, error: 'newDate and newSlotId are required' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (booking.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });

    // User Rule: can't reschedule if payment is already done or work has started
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, error: 'Cannot reschedule this booking after payment is completed' });
    }

    if (['cancelled', 'completed', 'rejected', 'in_progress'].includes(booking.status)) {
      return res.status(400).json({ success: false, error: `Cannot reschedule a ${booking.status} booking` });
    }

    // 1. Release old slot
    const oldDateStr = new Date(booking.scheduledDate).toISOString().split('T')[0];
    await Availability.findOneAndUpdate(
      { providerId: booking.providerId, date: oldDateStr, 'slots._id': booking.slotId },
      { $set: { 'slots.$.isBooked': false } }
    );

    // 2. Book new slot atomicaly
    const newDateStr = new Date(newDate).toISOString().split('T')[0];
    const slotResult = await Availability.findOneAndUpdate(
      { providerId: booking.providerId, date: newDateStr, 'slots._id': newSlotId, 'slots.isBooked': false },
      { $set: { 'slots.$.isBooked': true } },
      { new: true }
    );

    if (!slotResult) {
      // Rollback: Re-book the old slot
      await Availability.findOneAndUpdate(
        { providerId: booking.providerId, date: oldDateStr, 'slots._id': booking.slotId },
        { $set: { 'slots.$.isBooked': true } }
      );
      return res.status(409).json({ success: false, error: 'The new slot is no longer available' });
    }

    // 3. Update booking with precise time from the slot
    const slot = slotResult.slots.find(s => s._id.toString() === newSlotId.toString());
    if (slot) {
      // Use "YYYY-MM-DDTHH:MM" format to be interpreted as local time on server
      // similar to how createBooking treats the input from datetime-local
      const localString = `${newDateStr}T${slot.startTime}`;
      booking.scheduledDate = new Date(localString);
    } else {
      // Fallback
      booking.scheduledDate = new Date(newDate);
    }
    
    booking.slotId = newSlotId;
    await booking.save();

    const populated = await populateBooking(Booking.findById(booking._id));

    res.status(200).json({ success: true, message: 'Booking rescheduled successfully', data: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get quotes for provider or customer
// @route   GET /api/v1/bookings/quotes
// @access  Private
exports.getMyQuotes = async (req, res) => {
  try {
    const filter = req.user.role === 'provider'
      ? { providerId: req.user.id }
      : { customerId: req.user.id };

    const quotes = await Quote.find(filter)
      .populate('customerId', 'name profilePicture email')
      .populate('providerId', 'name profilePicture')
      .populate('serviceId', 'title basePrice')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, count: quotes.length, data: quotes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// ─── CRIT-04: Async payout dispatcher with exponential backoff retry ──────────
async function dispatchPayoutWithRetry(bookingId, retriesLeft) {
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return;

    // Guard: don't re-run if already succeeded
    if (booking.payoutStatus === 'success') return;

    const result = await processCashfreePayout(booking);
    if (result.success) {
      await Booking.findByIdAndUpdate(bookingId, {
        payoutId: result.transferId,
        payoutStatus: 'processing', // becomes 'success' via Cashfree payout webhook
      });
      console.log(`[PAYOUT] Initiated for booking ${bookingId}, transferId: ${result.transferId}`);
    } else {
      if (retriesLeft > 0) {
        const delay = (4 - retriesLeft) * 30_000; // 30s, 60s, 90s
        console.warn(`[PAYOUT] Failed for ${bookingId}, retrying in ${delay / 1000}s... (${retriesLeft} left)`);
        console.warn(result);
        setTimeout(() => dispatchPayoutWithRetry(bookingId, retriesLeft - 1), delay);
      } else {
        // All retries exhausted — mark failed, alert via log (admin should intervene)
        await Booking.findByIdAndUpdate(bookingId, { payoutStatus: 'failed' });
        console.error(`[PAYOUT] PERMANENTLY FAILED for booking ${bookingId}. Manual intervention required.`);
      }
    }
  } catch (err) {
    console.error(`[PAYOUT] Exception for booking ${bookingId}:`, err.message);
    if (retriesLeft > 0) {
      setTimeout(() => dispatchPayoutWithRetry(bookingId, retriesLeft - 1), 60_000);
    } else {
      await Booking.findByIdAndUpdate(bookingId, { payoutStatus: 'failed' }).catch(() => { });
      console.error(`[PAYOUT] PERMANENTLY FAILED for booking ${bookingId}`);
    }
  }
}

// ─── Internal: Cashfree Payout API call ──────────────────────────────────────

async function processCashfreePayout(booking) {
  try {
    const provider = await User.findById(booking.providerId).lean();
    const rawBank = provider?.providerDetails?.bankDetails;

    const bank = rawBank ? {
      accountName: rawBank.accountName,
      accountNumber: decrypt(rawBank.accountNumber),
      ifscCode: decrypt(rawBank.ifscCode),
      bankName: rawBank.bankName,
    } : null;

    if (!bank?.accountNumber || !bank?.ifscCode || !bank?.accountName) {
      console.warn('[PAYOUT] Provider bank details missing or decryption failed:', booking.providerId);
      return { success: false, transferId: null, error: 'Bank details missing' };
    }

    const payoutAppId = process.env.CASHFREE_PAYOUT_APP_ID;
    const payoutSecret = process.env.CASHFREE_PAYOUT_SECRET_KEY;
    if (!payoutAppId || !payoutSecret) {
      console.error('[PAYOUT] Cashfree Payout credentials not configured');
      return { success: false, transferId: null, error: 'Payout not configured' };
    }

    // V2: Use sandbox or production base URL
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://api.cashfree.com/payout'
      : 'https://sandbox.cashfree.com/payout';

    // V2: No separate authorize step needed.
    // Authentication is via x-client-id and x-client-secret headers directly.

    const transferId = `PAY_${booking._id}`;

    // V2: Standard Transfer — POST /transfers
    const transferRes = await axios.post(
      `${baseUrl}/transfers`,
      {
        transfer_id: transferId,
        transfer_amount: booking.providerPayout,
        transfer_mode: 'banktransfer', // or 'upi'
        beneficiary_details: {
          beneficiary_id: `PROV_${booking.providerId}`,
          beneficiary_name: bank.accountName,
          beneficiary_instrument_details: {
            bank_account_number: bank.accountNumber || "026291800001191",
            bank_ifsc: bank.ifscCode || "YESB0000262",
            // For UPI, use: vpa: 'upi@address'
          },
          beneficiary_contact_details: {
            beneficiary_email: provider.email || '',
            beneficiary_phone: provider.phone || '9876543210',
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': payoutAppId,
          'x-client-secret': payoutSecret,
          'x-api-version': '2024-01-01',
        },
        timeout: 15_000,
      }
    );

    console.log(transferRes.data, 'transferRes');

    const status = transferRes.data?.status;
    return {
      success: status === 'SUCCESS' || status === 'PENDING',
      transferId,
      cfTransferId: transferRes.data?.cf_transfer_id || null,
    };
  } catch (err) {
    console.error('[PAYOUT] API error:', err.response?.data || err.message);
    return { success: false, transferId: null, error: err.response?.data?.message || err.message };
  }
}

module.exports.dispatchPayoutWithRetry = dispatchPayoutWithRetry;
