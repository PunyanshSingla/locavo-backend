const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Service',
      required: true,
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Please provide a date and time for the booking'],
    },
    // Slot reference (from Availability)
    slotId: { type: mongoose.Schema.ObjectId, default: null },
    status: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'],
      default: 'pending',
    },
    serviceAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipcode: { type: String, required: true },
    },
    totalPrice: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },    // 5% total cut (2.5% from customer, 2.5% from provider)
    providerPayout: { type: Number, default: 0 }, // 97.5% of base price

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentOrderId: { type: String, default: null },     // Cashfree order ID
    paymentSessionId: { type: String, default: null },   // Cashfree payment_session_id (for frontend SDK)

    specialInstructions: {
      type: String,
      maxlength: [500, 'Instructions cannot exceed 500 characters'],
    },

    // OTP for work-start handshake
    workOtp: { type: String, default: null },
    workOtpExpire: { type: Date, default: null },
    workOtpAttempts: { type: Number, default: 0 }, // MED-01: brute-force guard (max 5)

    // Idempotency: Cashfree payment webhook reference
    lastPaymentWebhookId: { type: String, default: null }, // CRIT-08

    // GPS captured when provider enters OTP
    providerLocation: {
      lat: { type: Number },
      lng: { type: Number },
      capturedAt: { type: Date },
    },

    jobImages: {
      before: { type: [String], default: [] },
      after: { type: [String], default: [] },
    },
    workNotes: { type: String, default: null },

    // Reference images provided by the customer at booking time
    customerImages: { type: [String], default: [] },

    // Customer verification after provider marks complete
    completionVerification: {
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'escalated'],
        default: 'pending',
      },
      reason: { type: String, default: null },
      disputeVideo: { type: String, default: null }, // Cloudinary URL of dispute video
      disputeImages: { type: [String], default: [] }, // Cloudinary URLs of dispute images
      verifiedAt: { type: Date, default: null },
      escalatedAt: { type: Date, default: null },
      providerResponse: {
        type: {
          type: String,
          enum: ['clarify', 'revisit'],
        },
        message: { type: String, default: null },
        respondedAt: { type: Date, default: null },
      },
    },

    adminDecision: {
      decision: {
        type: String,
        enum: ['professional_right', 'customer_right'],
        default: null,
      },
      adminNote: { type: String, default: null },
      resolvedAt: { type: Date, default: null },
    },

    // Payout details
    payoutId: { type: String, default: null }, // Cashfree payout transfer ID
    payoutStatus: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed'],
      default: 'pending',
    },

    // Rejection reason (from provider)
    rejectionReason: { type: String, default: null },

    acceptedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
