const express = require('express');
const { getPendingProviders, approveProvider } = require('../controllers/adminController');
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

router.get('/providers', getPendingProviders);
router.put('/providers/:id/approve', approveProvider);

// Category management
router.route('/categories')
  .get(getAllCategoriesAdmin)
  .post(createCategory);

router.route('/categories/:id')
  .put(updateCategory)
  .delete(deleteCategory);

module.exports = router;

