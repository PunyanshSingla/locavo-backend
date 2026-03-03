const User = require('../models/User');

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
          accountName:
            providerDetails.bankDetails?.accountName ||
            user.providerDetails?.bankDetails?.accountName ||
            '',
          accountNumber:
            providerDetails.bankDetails?.accountNumber ||
            user.providerDetails?.bankDetails?.accountNumber ||
            '',
          ifscCode:
            providerDetails.bankDetails?.ifscCode ||
            user.providerDetails?.bankDetails?.ifscCode ||
            '',
          bankName:
            providerDetails.bankDetails?.bankName ||
            user.providerDetails?.bankDetails?.bankName ||
            '',
        },
        rating: user.providerDetails?.rating || 0,
        numReviews: user.providerDetails?.numReviews || 0,
      };
    }

    await user.save();

    res.status(200).json({ success: true, data: user });
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
        .select('-password')
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
