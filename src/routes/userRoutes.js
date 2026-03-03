const express = require('express');
const { updateProfile, getApprovedProviders, getFeaturedProviders } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/providers/featured', getFeaturedProviders);
router.get('/providers/approved', getApprovedProviders);

// Apply auth middleware to all routes mapped to this router below
router.use(protect);

router.put('/profile', updateProfile);

module.exports = router;
