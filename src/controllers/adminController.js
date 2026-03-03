const User = require('../models/User');

// @desc    Get all pending providers
// @route   GET /api/v1/admin/providers
// @access  Private (Admin only)
exports.getPendingProviders = async (req, res, next) => {
  try {
    // Show all unapproved providers who have started their profile (have a bio).
    // The admin sees what's submitted vs missing from the UI itself.
    const providers = await User.find({
      role: 'provider',
      'providerDetails.isApproved': false,
      'providerDetails.bio': { $exists: true, $ne: '' },
    }).select('-password');

    res.status(200).json({
      success: true,
      count: providers.length,
      data: providers,
    });
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

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.role !== 'provider') {
      return res.status(400).json({ success: false, error: 'User is not a provider' });
    }

    if (user.providerDetails?.isApproved) {
      return res.status(400).json({ success: false, error: 'Provider is already approved' });
    }

    user.providerDetails.isApproved = true;
    await user.save();

    // Return minimal data - no sensitive bank details in response
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.providerDetails.isApproved,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
