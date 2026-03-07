const Category = require('../models/Category');
const Service = require('../models/Service');
const GlobalService = require('../models/GlobalService');
const User = require('../models/User');

// ─── Public ──────────────────────────────────────────────────────────────────

// @desc    Get all active categories (for homepage / public use)
// @route   GET /api/v1/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get single category by slug
// @route   GET /api/v1/categories/:slug
// @access  Public
exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true }).lean();

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

// @desc    Get ALL categories including inactive (admin view)
// @route   GET /api/v1/admin/categories
// @access  Private (Admin)
exports.getAllCategoriesAdmin = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: 1 }).lean();
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create a new category
// @route   POST /api/v1/admin/categories
// @access  Private (Admin)
exports.createCategory = async (req, res) => {
  try {
    const { name, icon, startingPrice, description } = req.body;

    const category = await Category.create({ name, icon, startingPrice, description });

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    // Duplicate key
    if (err.code === 11000) {
      return res.status(400).json({ success: false, error: 'A category with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update a category
// @route   PUT /api/v1/admin/categories/:id
// @access  Private (Admin)
exports.updateCategory = async (req, res) => {
  try {
    if (name !== undefined) category.name = name;
    if (icon !== undefined) category.icon = icon;
    if (startingPrice !== undefined) category.startingPrice = startingPrice;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, error: 'A category with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete a category
// @route   DELETE /api/v1/admin/categories/:id
// @access  Private (Admin)
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
// @desc    Get services within a category
// @route   GET /api/v1/categories/:id/services
// @access  Public
exports.getCategoryServices = async (req, res) => {
  try {
    const services = await GlobalService.find({ categoryId: req.params.id, isActive: true });
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get providers within a category
// @route   GET /api/v1/categories/:id/providers
// @access  Public
exports.getCategoryProviders = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const providerIds = await Service.find({ categoryId, isActive: true }).distinct('providerId');
    
    const providers = await User.find({
      _id: { $in: providerIds },
      role: 'provider',
      'providerDetails.isApproved': true
    }).select('-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails');

    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
