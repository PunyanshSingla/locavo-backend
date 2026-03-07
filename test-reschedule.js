const mongoose = require('mongoose');
const Booking = require('./src/models/Booking');
const { rescheduleBooking } = require('./src/controllers/bookingController');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Find a booking that is paid (or mock one)
  const booking = await Booking.findOne(); 
  console.log(booking);

  process.exit(0);
}
test();
