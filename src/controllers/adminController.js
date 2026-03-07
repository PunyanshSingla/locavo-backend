const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Category = require('../models/Category');
const GlobalService = require('../models/GlobalService');

// @desc    Get all providers
// @route   GET /api/v1/admin/providers
// @access  Private (Admin only)
exports.getProviders = async (req, res, next) => {
  try {
    const providers = await User.find({ role: 'provider' }).select('-password');
    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all pending providers
// @route   GET /api/v1/admin/providers/pending
// @access  Private (Admin only)
exports.getPendingProviders = async (req, res, next) => {
  try {
    const providers = await User.find({
      role: 'provider',
      'providerDetails.isApproved': false,
      'providerDetails.bio': { $exists: true, $ne: '' },
    }).select('-password');

    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Approve a provider
// @route   PUT /api/v1/admin/providers/:id/approve
// @access  Private (Admin only)
exports.approveProvider = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.role !== 'provider') return res.status(400).json({ success: false, error: 'User is not a provider' });

    user.providerDetails.isApproved = true;
    await user.save();

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Ban/Unban a provider
// @route   PUT /api/v1/admin/providers/:id/ban
// @access  Private (Admin only)
exports.banProvider = async (req, res, next) => {
  try {
    const { isBanned, reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.role !== 'provider') return res.status(400).json({ success: false, error: 'User is not a provider' });

    user.isBanned = isBanned;
    user.banReason = isBanned ? reason : null;
    await user.save();

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};


// ─── Global Service Management ───────────────────────────────────────────────

// @desc    Get all global services
// @route   GET /api/v1/admin/global-services
// @access  Private (Admin only)
exports.getGlobalServices = async (req, res, next) => {
  try {
    const services = await GlobalService.find().populate('categoryId', 'name').lean();
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create global service
// @route   POST /api/v1/admin/global-services
// @access  Private (Admin only)
exports.createGlobalService = async (req, res, next) => {
  try {
    const { name, categoryId, description, icon } = req.body;
    const service = await GlobalService.create({ name, categoryId, description, icon });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update global service
// @route   PUT /api/v1/admin/global-services/:id
// @access  Private (Admin only)
exports.updateGlobalService = async (req, res, next) => {
  try {
    const service = await GlobalService.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!service) return res.status(404).json({ success: false, error: 'Global service not found' });
    res.status(200).json({ success: true, data: service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete global service
// @route   DELETE /api/v1/admin/global-services/:id
// @access  Private (Admin only)
exports.deleteGlobalService = async (req, res, next) => {
  try {
    const service = await GlobalService.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, error: 'Global service not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get category details and stats (revenue, commission, services, providers, bookings)
// @route   GET /api/v1/admin/categories/:id/stats
// @access  Private (Admin only)
exports.getCategoryStats = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

    const globalServices = await GlobalService.find({ categoryId: req.params.id }).lean();
    
    // For stats, we still need the provider services
    const providerServices = await Service.find({ categoryId: req.params.id }).lean();
    const serviceIds = providerServices.map(s => s._id);

    const bookings = await Booking.find({ 
      serviceId: { $in: serviceIds }
    }).populate('customerId', 'name email').populate('providerId', 'name email').sort({ createdAt: -1 }).lean();

    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    const totalRevenue = paidBookings.reduce((acc, b) => acc + b.totalPrice, 0);
    const totalCommission = paidBookings.reduce((acc, b) => acc + (b.platformFee || 0), 0);
    
    // Get unique providers in this category
    const providerIds = [...new Set(providerServices.map(s => s.providerId.toString()))];
    const providers = await User.find({ _id: { $in: providerIds } }).select('name email providerDetails.rating').lean();

    res.status(200).json({
      success: true,
      data: {
        category,
        stats: { totalRevenue, totalCommission, bookingsCount: paidBookings.length },
        services: globalServices, // Now returning GlobalServices
        providers,
        bookings
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get service details and stats (revenue, commission, providers, bookings)
// @route   GET /api/v1/admin/services/:id/stats
// @access  Private (Admin only)
exports.getServiceStats = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate('categoryId', 'name').lean();
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

    const bookings = await Booking.find({ 
      serviceId: req.params.id
    }).populate('customerId', 'name email').populate('providerId', 'name email').sort({ createdAt: -1 }).lean();

    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    const totalRevenue = paidBookings.reduce((acc, b) => acc + b.totalPrice, 0);
    const totalCommission = paidBookings.reduce((acc, b) => acc + (b.platformFee || 0), 0);

    const provider = await User.findById(service.providerId).select('name email providerDetails').lean();

    res.status(200).json({
      success: true,
      data: {
        service,
        stats: { totalRevenue, totalCommission, bookingsCount: paidBookings.length },
        provider,
        bookings
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get global service details and aggregated stats across all providers
// @route   GET /api/v1/admin/global-services/:id/stats
// @access  Private (Admin only)
exports.getGlobalServiceStats = async (req, res, next) => {
  try {
    const globalService = await GlobalService.findById(req.params.id).populate('categoryId', 'name').lean();
    if (!globalService) return res.status(404).json({ success: false, error: 'Global service not found' });

    // All provider services linked to this global service
    const providerServices = await Service.find({ globalServiceId: req.params.id }).lean();
    const serviceIds = providerServices.map(s => s._id);

    // All bookings for those provider services
    const bookings = await Booking.find({ serviceId: { $in: serviceIds } })
      .populate('customerId', 'name email')
      .populate('providerId', 'name email providerDetails')
      .sort({ createdAt: -1 })
      .lean();

    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    const totalRevenue = paidBookings.reduce((acc, b) => acc + b.totalPrice, 0);
    const totalCommission = paidBookings.reduce((acc, b) => acc + (b.platformFee || 0), 0);

    // Unique providers offering this global service
    const providerIds = [...new Set(providerServices.map(s => s.providerId.toString()))];
    const providers = await User.find({ _id: { $in: providerIds } }).select('name email providerDetails').lean();

    res.status(200).json({
      success: true,
      data: {
        service: globalService,
        stats: { totalRevenue, totalCommission, bookingsCount: paidBookings.length },
        providers,
        bookings
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

const ServiceRequest = require('../models/ServiceRequest');
const CategoryRequest = require('../models/CategoryRequest');

// @desc    Get all service requests
// @route   GET /api/v1/admin/service-requests
// @access  Private (Admin only)
exports.getServiceRequests = async (req, res, next) => {
  try {
    const requests = await ServiceRequest.find()
      .populate('providerId', 'name email')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Handle service request (Approve/Reject)
// @route   PUT /api/v1/admin/service-requests/:id
// @access  Private (Admin only)
exports.handleServiceRequest = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const request = await ServiceRequest.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    request.status = status;
    if (adminNote !== undefined) request.adminNote = adminNote;
    await request.save();

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all category requests
// @route   GET /api/v1/admin/category-requests
// @access  Private (Admin only)
exports.getCategoryRequests = async (req, res, next) => {
  try {
    const requests = await CategoryRequest.find()
      .populate('providerId', 'name email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Handle category request (Approve/Reject)
// @route   PUT /api/v1/admin/category-requests/:id
// @access  Private (Admin only)
exports.handleCategoryRequest = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const request = await CategoryRequest.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, error: 'Category Request not found' });

    request.status = status;
    if (adminNote !== undefined) request.adminNote = adminNote;
    await request.save();

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get provider full details including docs and stats
// @route   GET /api/v1/admin/providers/:id/details
// @access  Private (Admin only)
exports.getProviderFullDetails = async (req, res, next) => {
  try {
    const provider = await User.findById(req.params.id).select('-password');
    if (!provider || provider.role !== 'provider') {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    const services = await Service.find({ providerId: req.params.id }).populate('globalServiceId').lean();
    const bookings = await Booking.find({ providerId: req.params.id })
      .populate('customerId', 'name email')
      .populate('serviceId', 'title')
      .sort({ createdAt: -1 })
      .lean();

    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    const totalRevenue = paidBookings.reduce((acc, b) => acc + b.totalPrice, 0);
    const totalCommission = paidBookings.reduce((acc, b) => acc + (b.platformFee || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        provider,
        services,
        bookings,
        stats: {
          totalRevenue,
          totalCommission,
          jobsCount: paidBookings.length
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all bookings in the platform
// @route   GET /api/v1/admin/bookings
// @access  Private (Admin only)
exports.getAllBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate('customerId', 'name email')
      .populate('providerId', 'name email')
      .populate({
        path: 'serviceId',
        select: 'title',
        populate: { path: 'globalServiceId', select: 'name' }
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get specific booking details
// @route   GET /api/v1/admin/bookings/:id
// @access  Private (Admin only)
exports.getBookingDetails = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customerId', 'name email phone profilePicture')
      .populate('providerId', 'name email phone profilePicture providerDetails')
      .populate({
        path: 'serviceId',
        populate: { path: 'globalServiceId' }
      });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }


    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get comprehensive dashboard stats
// @route   GET /api/v1/admin/dashboard/stats
// @access  Private (Admin only)
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'customer' });
    const totalProviders = await User.countDocuments({ role: 'provider' });
    const pendingProvidersCount = await User.countDocuments({ role: 'provider', 'providerDetails.isApproved': false });
    
    const bookings = await Booking.find().lean();
    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    
    const totalRevenue = paidBookings.reduce((acc, b) => acc + b.totalPrice, 0);
    const totalCommission = paidBookings.reduce((acc, b) => acc + (b.platformFee || 0), 0);
    
    const statusCounts = {
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      completed: bookings.filter(b => b.status === 'completed').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
      escalated: bookings.filter(b => b.completionVerification?.status === 'escalated').length,
    };

    // Get recent activity (last 5 bookings and last 5 new providers)
    const recentBookings = await Booking.find()
      .populate('customerId', 'name')
      .populate({
        path: 'serviceId',
        populate: { path: 'globalServiceId', select: 'name' }
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const newProviders = await User.find({ role: 'provider' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        users: { totalUsers, totalProviders, pendingProviders: pendingProvidersCount },
        finance: { totalRevenue, totalCommission },
        bookings: { total: bookings.length, statusCounts },
        recentActivity: { bookings: recentBookings, providers: newProviders }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all escalated disputes
// @route   GET /api/v1/admin/disputes
// @access  Private (Admin only)
exports.getEscalatedDisputes = async (req, res, next) => {
  try {
    const disputes = await Booking.find({ 'completionVerification.status': 'escalated' })
      .populate('customerId', 'name email phone profilePicture')
      .populate('providerId', 'name email phone profilePicture providerDetails')
      .populate({
        path: 'serviceId',
        populate: { path: 'globalServiceId' }
      })
      .sort({ 'completionVerification.escalatedAt': -1 });

    res.status(200).json({ success: true, count: disputes.length, data: disputes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Resolve a dispute
// @route   PUT /api/v1/admin/disputes/:id/resolve
// @access  Private (Admin only)
exports.resolveDispute = async (req, res, next) => {
  try {
    const { decision, adminNote } = req.body;
    if (!['professional_right', 'customer_right'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'Valid decision is required' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (booking.completionVerification?.status !== 'escalated') {
      return res.status(400).json({ success: false, error: 'This booking is not escalated' });
    }

    booking.adminDecision = {
      decision,
      adminNote: adminNote || null,
      resolvedAt: new Date(),
    };

    if (decision === 'professional_right') {
      // 1. Release payout
      const { dispatchPayout } = require('./bookingController');
      booking.payoutStatus = 'pending';
      booking.status = 'completed';
      booking.completionVerification.status = 'accepted'; 
      await booking.save();
      
      // Fire and forget payout
      setImmediate(() => dispatchPayout(booking._id.toString()));
    } else {
      // 2. Customer is right -> Reset to in_progress
      booking.status = 'in_progress';
      booking.completionVerification.status = 'pending'; // Reset so provider can re-mark complete
      // We keep the dispute history in the reason/images but allow fresh start
      await booking.save();
    }

    res.status(200).json({ success: true, message: 'Dispute resolved successfully', data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
