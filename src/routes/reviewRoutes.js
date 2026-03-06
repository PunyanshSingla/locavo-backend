const express = require('express');
const { addReview } = require('../controllers/reviewController');

const router = express.Router();

const { protect, authorize } = require('../middleware/authMiddleware');

router
  .route('/')
  .post(protect, authorize('customer'), addReview);

module.exports = router;
