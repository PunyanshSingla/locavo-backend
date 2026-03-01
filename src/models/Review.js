const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true, // One review per booking
    },
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
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: [true, 'Please add a rating between 1 and 5'],
    },
    comment: {
      type: String,
      required: [true, 'Please add a comment'],
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Prevent user from submitting more than one review per booking
reviewSchema.index({ bookingId: 1, customerId: 1 }, { unique: true });

// Static method to get avg rating and save
reviewSchema.statics.getAverageRating = async function (providerId) {
  const obj = await this.aggregate([
    {
      $match: { providerId: providerId },
    },
    {
      $group: {
        _id: '$providerId',
        averageRating: { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  try {
    await this.model('User').findByIdAndUpdate(providerId, {
      'providerDetails.rating': obj[0] ? obj[0].averageRating : 0,
      'providerDetails.numReviews': obj[0] ? obj[0].numReviews : 0,
    });
  } catch (err) {
    console.error(err);
  }
};

// Call getAverageRating after save
reviewSchema.post('save', function () {
  this.constructor.getAverageRating(this.providerId);
});

// Call getAverageRating before remove (using findOneAndDelete hook as remove is deprecated)
reviewSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    await doc.constructor.getAverageRating(doc.providerId);
  }
});

module.exports = mongoose.model('Review', reviewSchema);
