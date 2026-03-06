const Review = require('../models/Review');
const Booking = require('../models/Booking');

// @desc    Add a review for a completed booking
// @route   POST /api/v1/reviews
// @access  Private/Customer
exports.addReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating || !comment) {
      return res.status(400).json({ success: false, error: 'Please provide bookingId, rating, and comment' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: `No booking found with the id of ${bookingId}` });
    }

    if (booking.customerId.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to review this booking' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'You can only review completed bookings' });
    }

    if (booking.completionVerification && booking.completionVerification.status !== 'accepted') {
       return res.status(400).json({ success: false, error: 'Booking completion is not verified yet.' });
    }

    const reviewPayload = {
      bookingId,
      customerId: req.user.id,
      providerId: booking.providerId,
      rating: Number(rating),
      comment
    };

    const review = await Review.create(reviewPayload);
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'You have already submitted a review for this booking' });
    }
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all reviews (admin)
// @route   GET /api/v1/admin/reviews
// @access  Private/Admin
exports.getAllReviews = async (req, res) => {
  try {
    const { rating, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (rating) filter.rating = Number(rating);

    const skip = (Number(page) - 1) * Number(limit);

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('customerId', 'name email profilePicture')
        .populate('providerId', 'name email')
        .populate({ path: 'bookingId', select: 'serviceId', populate: { path: 'serviceId', select: 'title globalServiceId', populate: { path: 'globalServiceId', select: 'name' } } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, total, page: Number(page), data: reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete a review (admin)
// @route   DELETE /api/v1/admin/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
