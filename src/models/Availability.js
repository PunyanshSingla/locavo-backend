const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD' string for easy querying
      required: true,
    },
    slots: [
      {
        startTime: { type: String, required: true }, // 'HH:MM'
        endTime: { type: String, required: true },   // 'HH:MM'
        isBooked: { type: Boolean, default: false },
        bookingId: { type: mongoose.Schema.ObjectId, ref: 'Booking', default: null },
      },
    ],
  },
  { timestamps: true }
);

// Compound index to ensure one document per provider per date
availabilitySchema.index({ providerId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Availability', availabilitySchema);
