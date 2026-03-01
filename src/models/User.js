const mongoose = require('mongoose');

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
      rating: {
        type: Number,
        default: 0,
      },
      numReviews: {
        type: Number,
        default: 0,
      }
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
