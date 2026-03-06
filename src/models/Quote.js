const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema(
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
    },
    message: {
      type: String,
      required: [true, 'Please provide a message'],
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    budget: {
      type: Number, // Optional budget hint from customer
    },
    images: {
      type: [String],
      default: [], // Images uploaded by customer
    },
    status: {
      type: String,
      enum: ['pending', 'seen', 'replied', 'closed'],
      default: 'pending',
    },
    reply: {
      type: String,
      maxlength: [1000, 'Reply cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Quote', quoteSchema);
