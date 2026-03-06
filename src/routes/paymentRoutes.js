const express = require('express');
const {
  createFeatureOrder,
  verifyFeaturePayment,
  featurePaymentWebhook,
} = require('../controllers/paymentController');
const { bookingPaymentWebhook } = require('../controllers/bookingWebhookController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Webhooks (PUBLIC — Cashfree calls these directly, signature-verified internally) ──
router.post('/feature/webhook', featurePaymentWebhook);
router.post('/booking/webhook', bookingPaymentWebhook); // ✅ CRIT-08

// ── Provider-authenticated routes ───────────────────────────────────────────
router.use(protect);
router.post('/feature/create-order', createFeatureOrder);
router.get('/feature/verify/:orderId', verifyFeaturePayment);

module.exports = router;
