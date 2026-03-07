const express = require('express');
const { 
  getProviders,
  getPendingProviders, 
  approveProvider,
  banProvider,
  getCategoryStats,
  getServiceStats,
  getGlobalServices,
  createGlobalService,
  updateGlobalService,
  deleteGlobalService,
  getProviderFullDetails,
  getServiceRequests,
  handleServiceRequest,
  getCategoryRequests,
  handleCategoryRequest,
  getGlobalServiceStats,
  getAllBookings,
  getBookingDetails,
  getDashboardStats
} = require('../controllers/adminController');
const { getAllReviews, deleteReview } = require('../controllers/reviewController');

const {
  getAllCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication and must be accessed by an admin.
router.use(protect);
router.use(authorize('admin'));

// Provider management
router.get('/providers', getProviders);
router.get('/providers/pending', getPendingProviders);
router.put('/providers/:id/approve', approveProvider);
router.put('/providers/:id/ban', banProvider);

// Category management & stats
router.route('/categories')
  .get(getAllCategoriesAdmin)
  .post(createCategory);

router.get('/categories/:id/stats', getCategoryStats);

router.route('/categories/:id')
  .put(updateCategory)
  .delete(deleteCategory);

// Service stats
router.get('/services/:id/stats', getServiceStats);

// Global Service management
router.route('/global-services')
  .get(getGlobalServices)
  .post(createGlobalService);

router.get('/global-services/:id/stats', getGlobalServiceStats);
router.route('/global-services/:id')
  .put(updateGlobalService)
  .delete(deleteGlobalService);

router.get('/dashboard/stats', getDashboardStats);
router.get('/providers/:id/details', getProviderFullDetails);
router.get('/bookings', getAllBookings);
router.get('/bookings/:id', getBookingDetails);
router.get('/service-requests', getServiceRequests);
router.put('/service-requests/:id', handleServiceRequest);

router.get('/category-requests', getCategoryRequests);
router.put('/category-requests/:id', handleCategoryRequest);

// Review management
router.get('/reviews', getAllReviews);
router.delete('/reviews/:id', deleteReview);

module.exports = router;

