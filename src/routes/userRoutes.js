const express = require('express');
const {
  updateProfile,
  getApprovedProviders,
  getFeaturedProviders,
  getProvidersNearMe,
  getProviderById,
  getProviderReviews,
  getProviderServices,
  becomeProvider,
  updateBanner,
  addProject,
  deleteProject,
  toggleWishlist,
  getWishlist,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public routes ────────────────────────────────────────────────────────────
router.get('/providers/featured', getFeaturedProviders);
router.get('/providers/near-me', getProvidersNearMe);
router.get('/providers/approved', getApprovedProviders);
router.get('/providers/:id', getProviderById);
router.get('/providers/:id/reviews', getProviderReviews);
router.get('/providers/:id/services', getProviderServices);

// ── Protected routes ─────────────────────────────────────────────────────────
router.use(protect);

router.post('/become-provider', becomeProvider);
router.put('/profile', updateProfile);
router.put('/profile/banner', updateBanner);

// Provider portfolio
router.post('/projects', addProject);
router.delete('/projects/:projectId', deleteProject);

// Customer wishlist
router.get('/wishlist', getWishlist);
router.post('/wishlist/:providerId', toggleWishlist);

module.exports = router;
