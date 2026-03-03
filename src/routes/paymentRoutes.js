const express = require('express');
const {
  createFeatureOrder,
  verifyFeaturePayment,
  featurePaymentWebhook,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Webhook must NOT be behind auth (Cashfree calls it directly)
// It handles its own signature-based security
router.post('/feature/webhook', featurePaymentWebhook);

// Provider-authenticated routes
router.use(protect);
router.post('/feature/create-order', createFeatureOrder);
router.get('/feature/verify/:orderId', verifyFeaturePayment);

module.exports = router;
