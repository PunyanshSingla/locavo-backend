const mongoose = require('mongoose');

const globalServiceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    categoryId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Category',
      required: true,
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    icon: {
      type: String,
      default: 'design_services',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GlobalService', globalServiceSchema);
