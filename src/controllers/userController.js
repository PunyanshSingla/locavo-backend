const User = require('../models/User');
const Review = require('../models/Review');
const Service = require('../models/Service');
const { encrypt, decrypt } = require('../utils/encryption'); // MED-03

// Helper: validate a URL is a Cloudinary URL from our expected domain
const isValidCloudinaryUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('https://res.cloudinary.com/');
};

// @desc    Get featured providers (paid ₹500, featuredUntil in the future)
// @route   GET /api/v1/users/providers/featured
// @access  Public
exports.getFeaturedProviders = async (req, res) => {
  try {
    const now = new Date();
    const providers = await User.find({
      role: 'provider',
      'providerDetails.isApproved': true,
      'providerDetails.isFeatured': true,
      'providerDetails.featuredUntil': { $gt: now },
    })
      .select('-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails')
      .sort({ 'providerDetails.rating': -1 })
      .lean();

    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get single provider public profile
// @route   GET /api/v1/users/providers/:id
// @access  Public
exports.getProviderById = async (req, res) => {
  try {
    const provider = await User.findOne({
      _id: req.params.id,
      role: 'provider',
      'providerDetails.isApproved': true,
    }).select('-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails -wishlist');

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    res.status(200).json({ success: true, data: provider });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get reviews for a provider (paginated)
// @route   GET /api/v1/users/providers/:id/reviews
// @access  Public
exports.getProviderReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ providerId: req.params.id })
        .populate('customerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ providerId: req.params.id }),
    ]);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: reviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get active services for a provider
// @route   GET /api/v1/users/providers/:id/services
// @access  Public
exports.getProviderServices = async (req, res) => {
  try {
    const services = await Service.find({
      providerId: req.params.id,
      isActive: true,
    })
      .populate('categoryId', 'name icon')
      .populate('globalServiceId', 'name description')
      .lean();

    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Convert current user to provider role
// @route   POST /api/v1/users/become-provider
// @access  Private
exports.becomeProvider = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Admins cannot become providers' });
    }

    if (user.role === 'provider') {
      return res.status(200).json({ success: true, data: user, message: 'User is already a provider' });
    }

    user.role = 'provider';
    await user.save();

    return res.status(200).json({ success: true, data: user, message: 'Role updated to provider' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/v1/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address, providerDetails } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Only update allowed fields
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    // Update address - explicitly allow empty strings to clear fields
    if (address) {
      user.address = {
        street: address.street !== undefined ? address.street : user.address?.street,
        city: address.city !== undefined ? address.city : user.address?.city,
        state: address.state !== undefined ? address.state : user.address?.state,
        zipcode: address.zipcode !== undefined ? address.zipcode : user.address?.zipcode,
        country: address.country !== undefined ? address.country : user.address?.country,
      };
    }

    // Update location
    if (req.body.location) {
      user.location = {
        type: 'Point',
        coordinates: [
          parseFloat(req.body.location.lng),
          parseFloat(req.body.location.lat),
        ],
        formattedAddress: req.body.location.formattedAddress,
      };
    }


    // Update provider details (only if user is a provider)
    if (providerDetails && user.role === 'provider') {
      const newDocumentImage = providerDetails.documentImage;
      const newLiveSelfie = providerDetails.liveSelfie;

      user.providerDetails = {
        bio: providerDetails.bio !== undefined ? providerDetails.bio : user.providerDetails?.bio,
        experienceYears:
          providerDetails.experienceYears !== undefined
            ? providerDetails.experienceYears
            : user.providerDetails?.experienceYears,
        skills: providerDetails.skills || user.providerDetails?.skills,
        isAvailable:
          providerDetails.isAvailable !== undefined
            ? providerDetails.isAvailable
            : user.providerDetails?.isAvailable,
        isApproved: user.providerDetails?.isApproved || false, // Cannot self-approve
        documentType: providerDetails.documentType || user.providerDetails?.documentType,
        documentImage: newDocumentImage || user.providerDetails?.documentImage,
        liveSelfie: newLiveSelfie || user.providerDetails?.liveSelfie,
        bankDetails: {
          // ✅ MED-03: Encrypt sensitive bank fields at rest
          accountName:
            providerDetails.bankDetails?.accountName ||
            user.providerDetails?.bankDetails?.accountName ||
            '',
          accountNumber: encrypt(
            providerDetails.bankDetails?.accountNumber ||
            decrypt(user.providerDetails?.bankDetails?.accountNumber) ||
            ''
          ),
          ifscCode: encrypt(
            providerDetails.bankDetails?.ifscCode ||
            decrypt(user.providerDetails?.bankDetails?.ifscCode) ||
            ''
          ),
          bankName:
            providerDetails.bankDetails?.bankName ||
            user.providerDetails?.bankDetails?.bankName ||
            '',
        },
        bannerImage: providerDetails.bannerImage || user.providerDetails?.bannerImage,
        projects: user.providerDetails?.projects || [],
        rating: user.providerDetails?.rating || 0,
        numReviews: user.providerDetails?.numReviews || 0,
        isFeatured: user.providerDetails?.isFeatured || false,
        featuredUntil: user.providerDetails?.featuredUntil || null,
      };
    }

    await user.save();

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update provider banner image
// @route   PUT /api/v1/users/profile/banner
// @access  Private (Provider)
exports.updateBanner = async (req, res) => {
  try {
    const { bannerImage } = req.body;

    if (!bannerImage || !isValidCloudinaryUrl(bannerImage)) {
      return res.status(400).json({ success: false, error: 'A valid Cloudinary banner image URL is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can update a banner' });
    }

    user.providerDetails.bannerImage = bannerImage;
    await user.save();

    res.status(200).json({ success: true, data: { bannerImage: user.providerDetails.bannerImage } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Add a project to provider portfolio
// @route   POST /api/v1/users/projects
// @access  Private (Provider)
exports.addProject = async (req, res) => {
  try {
    const { title, description, beforeImages, afterImages, completedAt } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Project title is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can add projects' });
    }

    const project = {
      title,
      description,
      beforeImages: beforeImages || [],
      afterImages: afterImages || [],
      completedAt: completedAt ? new Date(completedAt) : undefined,
    };

    user.providerDetails.projects.push(project);
    await user.save();

    const newProject = user.providerDetails.projects[user.providerDetails.projects.length - 1];
    res.status(201).json({ success: true, data: newProject });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete a project from provider portfolio
// @route   DELETE /api/v1/users/projects/:projectId
// @access  Private (Provider)
exports.deleteProject = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can delete projects' });
    }

    const project = user.providerDetails.projects.id(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    project.deleteOne();
    await user.save();

    res.status(200).json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Toggle wishlist — add or remove a provider
// @route   POST /api/v1/users/wishlist/:providerId
// @access  Private (Customer)
exports.toggleWishlist = async (req, res) => {
  try {
    const providerId = req.params.providerId;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify the target is actually an approved provider
    const provider = await User.findOne({
      _id: providerId,
      role: 'provider',
      'providerDetails.isApproved': true,
    });

    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    const index = user.wishlist.findIndex((id) => id.toString() === providerId);
    let added;

    if (index > -1) {
      // Already in wishlist — remove
      user.wishlist.splice(index, 1);
      added = false;
    } else {
      // Not in wishlist — add
      user.wishlist.push(providerId);
      added = true;
    }

    await user.save();

    res.status(200).json({ success: true, added, wishlistCount: user.wishlist.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get customer's wishlist
// @route   GET /api/v1/users/wishlist
// @access  Private
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        select: '-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails',
        match: { role: 'provider', 'providerDetails.isApproved': true },
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.status(200).json({ success: true, count: user.wishlist.length, data: user.wishlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all approved providers
// @route   GET /api/v1/users/providers/approved
// @access  Public
exports.getApprovedProviders = async (req, res, next) => {
  try {
    // Pagination support: ?page=1&limit=20
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [providers, total] = await Promise.all([
      User.find({ role: 'provider', 'providerDetails.isApproved': true })
        // ✅ MED-06: Exclude sensitive fields from public endpoint
        .select('-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails')
        .skip(skip)
        .limit(limit),
      User.countDocuments({ role: 'provider', 'providerDetails.isApproved': true }),
    ]);

    res.status(200).json({
      success: true,
      count: providers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: providers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
// @desc    Get providers near a location
// @route   GET /api/v1/users/providers/near-me
// @access  Public
exports.getProvidersNearMe = async (req, res) => {
  try {
    const { lat, lng, distance = 20 } = req.query; // default 20km

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Please provide latitude and longitude' });
    }

    // Convert distance (km) to radius in radians
    const radius = parseFloat(distance) / 6371;

    const providers = await User.find({
      role: 'provider',
      'providerDetails.isApproved': true,
      location: {
        $geoWithin: {
          $centerSphere: [[parseFloat(lng), parseFloat(lat)], radius],
        },
      },
    })
      .select('-password -providerDetails.documentImage -providerDetails.liveSelfie -providerDetails.bankDetails')
      .lean();

    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
