const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'provider', 'admin'],
      default: 'customer',
    },
    phone: {
      type: String,
      maxlength: [20, 'Phone number cannot be longer than 20 characters'],
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipcode: String,
      country: String,
    },
    profilePicture: {
      type: String,
      default: 'default.jpg',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCode: {
      type: String,
    },
    emailVerificationCodeExpire: {
      type: Date,
    },
    authProvider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email',
    },
    googleId: {
      type: String,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    // Provider-specific fields
    providerDetails: {
      bio: {
        type: String,
        maxlength: [500, 'Bio cannot be more than 500 characters'],
      },
      experienceYears: {
        type: Number,
        min: 0,
      },
      skills: [String],
      isAvailable: {
        type: Boolean,
        default: true,
      },
      isApproved: {
        type: Boolean,
        default: false,
      },
      documentType: {
        type: String,
        enum: ['Aadhar Card', 'PAN Card', 'Driving License', 'Passport', 'Voter ID'],
      },
      documentImage: {
        type: String, // Cloudinary URL
      },
      liveSelfie: {
        type: String, // Cloudinary URL
      },
      bankDetails: {
        accountName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
      },
      rating: {
        type: Number,
        default: 0,
      },
      numReviews: {
        type: Number,
        default: 0,
      },
      isFeatured: {
        type: Boolean,
        default: false,
      },
      featuredUntil: {
        type: Date, // null = not featured; set to 30 days ahead on payment
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);
// Encrypt password using bcrypt
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
