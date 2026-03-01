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
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'rejected'],
      default: 'pending',
    },
    serviceAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipcode: { type: String, required: true },
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    specialInstructions: {
      type: String,
      maxlength: [500, 'Instructions cannot exceed 500 characters'],
    },
    issueImages: {
      type: [String],
      default: [],
    },
    providerNotes: {
      type: String,
      maxlength: [1000, 'Provider notes cannot exceed 1000 characters'],
    },
    jobImages: {
      before: {
        type: [String],
        default: [],
      },
      after: {
        type: [String],
        default: [],
      },
    },
    acceptedAt: {
      type: Date,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
