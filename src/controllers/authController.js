const User = require('../models/User');
const { Resend } = require('resend');
const crypto = require('crypto');
const ErrorResponse = require('../utils/ErrorResponse');
const { OAuth2Client } = require('google-auth-library');

const resend = new Resend(process.env.RESEND_API_KEY);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Shared helper: find or create a user from a verified Google payload ────
const findOrCreateGoogleUser = async (googleId, email, name, picture, role) => {
  let user = await User.findOne({ email });

  if (user) {
    // Existing user: link Google account if not already linked
    if (user.authProvider !== 'google') {
      user.googleId = googleId;
      user.authProvider = 'google';
      user.isEmailVerified = true;
      await user.save();
    }
  } else {
    // New user: create with a strong random password (not used for login)
    const dummyPassword =
      Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    user = await User.create({
      name,
      email,
      password: dummyPassword,
      role: role || 'customer',
      profilePicture: picture,
      authProvider: 'google',
      googleId,
      isEmailVerified: true,
    });
  }
  return user;
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      if (!userExists.isEmailVerified) {
        return res.status(400).json({
          success: false,
          error: 'User exists but email is not verified. Please verify your email.',
        });
      }
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Generate 6-digit code + 15-minute expiry
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      emailVerificationCode: verificationCode,
      emailVerificationCodeExpire: verificationExpire,
      authProvider: 'email',
    });

    try {
      await resend.emails.send({
        from: 'Locavo <locavo@locavo.punyanshsingla.com>',
        to: email,
        subject: 'Verify your Locavo account',
        html: `<p>Your verification code is: <strong>${verificationCode}</strong></p><p>This code expires in 15 minutes.</p>`,
      });
    } catch (emailErr) {
      console.error('Email failed to send, but user created:', emailErr.message);
    }

    res.status(201).json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Email Code
// @route   POST /api/v1/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, error: 'Email already verified' });
    }

    // Check expiry
    if (!user.emailVerificationCodeExpire || user.emailVerificationCodeExpire < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'Verification code has expired. Please request a new one.',
      });
    }

    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpire = undefined;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Resend Verification Email Code
// @route   POST /api/v1/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, error: 'Email already verified' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    try {
      await resend.emails.send({
        from: 'Locavo <locavo@locavo.punyanshsingla.com>',
        to: email,
        subject: 'Verify your Locavo account',
        html: `<p>Your new verification code is: <strong>${verificationCode}</strong></p><p>This code expires in 15 minutes.</p>`,
      });
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr.message);
    }

    res.status(200).json({ success: true, message: 'Verification code resent. Check your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || user.authProvider !== 'email') {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        error: 'Please verify your email first',
        requiresVerification: true,
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Google OAuth Login (token-based from frontend popup)
// @route   POST /api/v1/auth/google
// @access  Public
exports.googleLogin = async (req, res, next) => {
  try {
    const { token, role } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const user = await findOrCreateGoogleUser(googleId, email, name, picture, role);

    sendTokenResponse(user, user ? 200 : 201, res);
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, error: 'Google Authentication failed' });
  }
};

// @desc    Google OAuth Callback for Redirect Flow
// @route   POST /api/v1/auth/google/callback
// @access  Public
exports.googleCallback = async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.redirect(`${FRONTEND_URL}/login?error=NoTokenProvided`);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const user = await findOrCreateGoogleUser(googleId, email, name, picture, 'customer');

    const token = user.getSignedJwtToken();

    // Set token in httpOnly cookie
    const options = {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    };

    res.cookie('token', token, options);

    // Redirect to frontend — include token so the SPA can update auth state
    res.redirect(`${FRONTEND_URL}/google-auth-success?success=true&token=${token}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=GoogleAuthFailed`);
  }
};

// @desc    Forgot Password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    // Return generic message to prevent user enumeration
    if (!user || user.authProvider === 'google') {
      return res.status(200).json({
        success: true,
        message: 'If that email is registered, you will receive a reset link shortly.',
      });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;

    try {
      await resend.emails.send({
        from: 'Locavo <locavo@locavo.punyanshsingla.com>',
        to: user.email,
        subject: 'Password Reset Request',
        html: `<p>You requested a password reset. Click the link below to reset it (valid for 10 minutes):</p>
               <a href="${resetUrl}" target="_blank">Reset Password</a>`,
      });

      res.status(200).json({
        success: true,
        message: 'If that email is registered, you will receive a reset link shortly.',
      });
    } catch (err) {
      console.error(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, error: 'Email could not be sent' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Reset Password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;

    // Basic validation
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// Helper: create token and send JSON response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token, // Still send token in body for convenience, but the cookie is the primary secure storage
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profilePicture: user.profilePicture,
        address: user.address,
        location: user.location,
        providerDetails: user.providerDetails,
      },
    });
};
