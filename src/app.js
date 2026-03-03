const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const errorHandler = require('./middleware/errorHandler')

const app = express()

// Route files
const auth = require('./routes/authRoutes');
const users = require('./routes/userRoutes');
const admin = require('./routes/adminRoutes');
const upload = require('./routes/uploadRoutes');
const categories = require('./routes/categoryRoutes');
const payments = require('./routes/paymentRoutes');

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Rate Limiters ───────────────────────────────────────────────────────────

// Strict limiter for auth mutation routes (login, register, password reset)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again after 15 minutes.' },
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
app.use('/api/v1/auth', authLimiter, auth);
app.use('/api/v1/auth/resend-verification', emailLimiter);
app.use('/api/v1/auth/forgotpassword', emailLimiter);
app.use('/api/v1/users', users);
app.use('/api/v1/admin', admin);
app.use('/api/v1/upload', upload);
app.use('/api/v1/categories', categories);
app.use('/api/v1/payments', payments);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// ── Centralized Error Handler (must be last) ────────────────────────────────
app.use(errorHandler)

module.exports = app