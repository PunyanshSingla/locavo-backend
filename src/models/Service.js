const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Category',
      required: true,
    },
    globalServiceId: {
      type: mongoose.Schema.ObjectId,
      ref: 'GlobalService',
      required: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Service title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    basePrice: {
      type: Number,
      required: [true, 'Please add a base price for the service'],
    },
    durationMinutes: {
      type: Number,
      required: [true, 'Please specify the estimated duration in minutes'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Service', serviceSchema);
