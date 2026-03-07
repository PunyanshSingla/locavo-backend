const Service = require('../models/Service');
const GlobalService = require('../models/GlobalService');
const ServiceRequest = require('../models/ServiceRequest');
const CategoryRequest = require('../models/CategoryRequest');

// @desc    Provider adds a new service
// @route   POST /api/v1/services
// @access  Private (Provider)
exports.createService = async (req, res) => {
  try {
    const { basePrice, durationMinutes, globalServiceId } = req.body;

    if (!basePrice || !durationMinutes || !globalServiceId) {
      return res.status(400).json({ success: false, error: 'basePrice, durationMinutes, and globalServiceId are required' });
    }

    const globalService = await GlobalService.findById(globalServiceId);
    if (!globalService) {
      return res.status(404).json({ success: false, error: 'Global service not found' });
    }

    const service = await Service.create({
      providerId: req.user.id,
      categoryId: globalService.categoryId,
      globalServiceId,
      title: globalService.name,
      description: globalService.description,
      basePrice,
      durationMinutes,
    });

    const populated = await service.populate('categoryId', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider updates a service
// @route   PUT /api/v1/services/:id
// @access  Private (Provider)
exports.updateService = async (req, res) => {
  try {
    let service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    if (service.providerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('categoryId', 'name');
    res.status(200).json({ success: true, data: service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider deletes a service
// @route   DELETE /api/v1/services/:id
// @access  Private (Provider)
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    if (service.providerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await service.deleteOne();
    res.status(200).json({ success: true, message: 'Service deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Request a new global service
// @route   POST /api/v1/services/request
// @access  Private (Provider)
exports.requestService = async (req, res) => {
  try {
    const { name, description, categoryId } = req.body;

    if (!name || !description || !categoryId) {
      return res.status(400).json({ success: false, error: 'name, description, and categoryId are required' });
    }

    const request = await ServiceRequest.create({
      providerId: req.user.id,
      name,
      description,
      categoryId
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get provider's own service requests
// @route   GET /api/v1/services/my-service-requests
// @access  Private (Provider)
exports.getMyServiceRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ providerId: req.user.id })
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Request a new category
// @route   POST /api/v1/services/category-request
// @access  Private (Provider)
exports.requestCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, error: 'name and description are required' });
    }

    const request = await CategoryRequest.create({
      providerId: req.user.id,
      name,
      description
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get provider's own category requests
// @route   GET /api/v1/services/my-category-requests
// @access  Private (Provider)
exports.getMyCategoryRequests = async (req, res) => {
  try {
    const requests = await CategoryRequest.find({ providerId: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all global services (for providers to choose from)
// @route   GET /api/v1/services/global
// @access  Private (any authenticated user)
exports.getGlobalServicesPublic = async (req, res) => {
  try {
    const services = await GlobalService.find({ isActive: true })
      .populate('categoryId', 'name icon')
      .lean();
    res.status(200).json({ success: true, data: services });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
