const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

const path = require('path');
// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@gmail.com' });
    if (existingAdmin) {
      console.log('Admin user already exists.');
      process.exit(0);
    }

    // Create the admin user
    const adminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@gmail.com',
      password: 'Admin@1234',
      role: 'admin',
      isEmailVerified: true, // Auto-verify the seeded admin
    });

    console.log(`Admin user created: ${adminUser.email}`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin:', err);
    process.exit(1);
  }
};

seedAdmin();
