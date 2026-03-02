const User = require('../models/User');
const dotenv = require('dotenv');
dotenv.config();
if(!process.env.RESEND_API_KEY){
  console.log('RESEND_API_KEY not found');
}
const { Resend } = require('resend');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const resend = new Resend(process.env.RESEND_API_KEY);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      if (!userExists.isEmailVerified) {
        return res.status(400).json({ success: false, error: 'User exists but email is not verified. Please verify your email.' });
      }
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Generate 6 digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      emailVerificationCode: verificationCode,
      authProvider: 'email'
    });

    // Send email (Mocked for Buildathon, or use actual if API key valid)
    try {
      await resend.emails.send({
        from: 'Locavo <locavo@locavo.punyanshsingla.com>',
        to: email,
        subject: 'Verify your Locavo account',
        html: `<p>Your verification code is: <strong>${verificationCode}</strong></p>`
      });
    } catch (emailErr) {
      console.error('Email failed to send, but user created:', emailErr);
    }

    res.status(201).json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error', message: err.message });
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

    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = undefined; // Clear code
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

    // Generate 6 digit code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    await user.save();

    // Send email
    try {
      await resend.emails.send({
        from: 'Locavo <onboarding@resend.dev>',
        to: email,
        subject: 'Verify your Locavo account',
        html: `<p>Your verification code is: <strong>${verificationCode}</strong></p>`
      });
    } catch (emailErr) {
      console.error('Email failed to send resend code:', emailErr);
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

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({ success: false, error: 'Please verify your email first', requiresVerification: true });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Google OAuth Login
// @route   POST /api/v1/auth/google
// @access  Public
exports.googleLogin = async (req, res, next) => {
  try {
    const { token, role } = req.body; // Role might be needed on first signup via google

    if (!token) {
       return res.status(400).json({ success: false, error: 'No token provided' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (user) {
      // User exists, login
      if (user.authProvider !== 'google') {
          // If they signed up with email but are trying to log in with google
          user.googleId = googleId;
          user.authProvider = 'google';
          user.isEmailVerified = true;
          await user.save();
      }
      sendTokenResponse(user, 200, res);
    } else {
      // User doesn't exist, register
      user = await User.create({
        name,
        email,
        password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8), // Dummy strong password
        role: role || 'customer', // Default to customer if not provided in request
        profilePicture: picture,
        authProvider: 'google',
        googleId,
        isEmailVerified: true, // Google verifies email inherently
      });
      sendTokenResponse(user, 201, res);
    }
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ success: false, error: 'Google Authentication failed' });
  }
};// @desc    Google OAuth Callback for Redirect Flow
// @route   POST /api/v1/auth/google/callback
// @access  Public
exports.googleCallback = async (req, res, next) => {
  try {
    const { credential, g_csrf_token } = req.body;

    if (!credential) {
       return res.redirect('http://localhost:5173/login?error=NoTokenProvided');
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (user) {
      if (user.authProvider !== 'google') {
          user.googleId = googleId;
          user.authProvider = 'google';
          user.isEmailVerified = true;
          await user.save();
      }
    } else {
      user = await User.create({
        name,
        email,
        password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8),
        role: 'customer',
        profilePicture: picture,
        authProvider: 'google',
        googleId,
        isEmailVerified: true,
      });
    }

    const token = user.getSignedJwtToken();
    
    // Redirect back to frontend
    res.redirect(`http://localhost:5173/google-auth-success?token=${token}&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&role=${user.role}`);

  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect('http://localhost:5173/login?error=GoogleAuthFailed');
  }
};

// @desc    Forgot Password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).json({ success: false, error: 'There is no user with that email' });
    }

    if (user.authProvider === 'google') {
        return res.status(400).json({ success: false, error: 'You signed up with Google. Please use Google to login.' });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset url
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
      await resend.emails.send({
        from: 'Locavo <locavo@locavo.punyanshsingla.com>',
        to: user.email,
        subject: 'Password reset token',
        html: `<p>You requested a password reset. Click the link below to reset it:</p>
               <a href="${resetUrl}" target="_blank">Reset Password</a>`
      });

      res.status(200).json({ success: true, message: 'Email sent' });
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
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid token' });
    }

    // Set new password
    user.password = req.body.password;
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

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  });
};
