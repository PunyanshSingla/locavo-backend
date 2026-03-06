const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const errorHandler = require('./middleware/errorHandler')

const app = express()

// Route files
const auth = require('./routes/authRoutes');
const users = require('./routes/userRoutes');
const admin = require('./routes/adminRoutes');
const upload = require('./routes/uploadRoutes');
const categories = require('./routes/categoryRoutes');
const payments = require('./routes/paymentRoutes');
const quotes = require('./routes/quoteRoutes');
const bookings = require('./routes/bookingRoutes');
const services = require('./routes/serviceRoutes');
const availability = require('./routes/availabilityRoutes');
const chat = require('./routes/chatRoutes'); // Socket.io chat history
const reviews = require('./routes/reviewRoutes'); // Reviews

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// ── Rate Limiters ───────────────────────────────────────────────────────────

// Strict limiter for auth mutations (register, password reset)
// Note: login is handled slightly more permissively than register to prevent lockouts
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again after 15 minutes.' },
});

// Relaxed limiter for general API routes and session verification
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 300, // 300 requests per 15 mins is more than enough for normal SPA usage
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limiter for resend/forgot (prevent email spam)
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many email requests. Please try again in an hour.' },
});

// ── Mount routers ───────────────────────────────────────────────────────────
app.use('/api', generalLimiter); // Apply general limit to all API routes
app.use('/api/v1/auth/register', strictAuthLimiter);
app.use('/api/v1/auth/resend-verification', emailLimiter);
app.use('/api/v1/auth/forgotpassword', emailLimiter);
app.use('/api/v1/auth', auth);
app.use('/api/v1/users', users);
app.use('/api/v1/admin', admin);
app.use('/api/v1/upload', upload);
app.use('/api/v1/categories', categories);
app.use('/api/v1/payments', payments);
app.use('/api/v1/quotes', quotes);
app.use('/api/v1/bookings', bookings);
app.use('/api/v1/services', services);
app.use('/api/v1/availability', availability);
app.use('/api/v1/chat', chat);
app.use('/api/v1/reviews', reviews);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// ── Centralized Error Handler (must be last) ────────────────────────────────
app.use(errorHandler)

module.exports = app