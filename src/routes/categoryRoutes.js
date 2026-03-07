const express = require('express');
const {
  getCategories,
  getCategoryBySlug,
  getCategoryServices,
  getCategoryProviders,
} = require('../controllers/categoryController');

const router = express.Router();

router.get('/', getCategories);
router.get('/:id/services', getCategoryServices);
router.get('/:id/providers', getCategoryProviders);
router.get('/:slug', getCategoryBySlug);

module.exports = router;
