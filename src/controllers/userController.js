const User = require('../models/User');

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
    if (phone) user.phone = phone;
    
    // Update address if provided
    if (address) {
      user.address = {
        street: address.street || user.address?.street,
        city: address.city || user.address?.city,
        state: address.state || user.address?.state,
        zipcode: address.zipcode || user.address?.zipcode,
        country: address.country || user.address?.country,
      };
    }

    // Update provider details if provided
    if (providerDetails && user.role === 'provider') {
      user.providerDetails = {
        bio: providerDetails.bio || user.providerDetails?.bio,
        experienceYears: providerDetails.experienceYears !== undefined ? providerDetails.experienceYears : user.providerDetails?.experienceYears,
        skills: providerDetails.skills || user.providerDetails?.skills,
        isAvailable: providerDetails.isAvailable !== undefined ? providerDetails.isAvailable : user.providerDetails?.isAvailable,
        isApproved: user.providerDetails?.isApproved || false, // Do not allow self-approval
        rating: user.providerDetails?.rating || 0,
        numReviews: user.providerDetails?.numReviews || 0,
      };
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
