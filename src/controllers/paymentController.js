const { Cashfree, CFEnvironment } = require('cashfree-pg');
const crypto = require('crypto');
const User = require('../models/User');
const WebhookEvent = require('../models/WebhookEvent'); // MED-04

// ── Cashfree SDK init (static properties — NOT constructor args) ──────────────
const cashfree = new Cashfree(CFEnvironment.SANDBOX, process.env.CASHFREE_APP_ID, process.env.CASHFREE_SECRET_KEY);

const FEATURED_AMOUNT = 500; // ₹500


// ─── Create a feature payment order ──────────────────────────────────────────

// @desc    Create Cashfree order for featured listing (₹500)
// @route   POST /api/v1/payments/feature/create-order
// @access  Private (Provider only)
exports.createFeatureOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can purchase a featured listing' });
    }

    if (!user.providerDetails?.isApproved) {
      return res.status(403).json({ success: false, error: 'Your profile must be approved before purchasing a featured listing' });
    }

    // If already featured and not expired, reject
    if (user.providerDetails.isFeatured && user.providerDetails.featuredUntil > new Date()) {
      return res.status(400).json({
        success: false,
        error: `You are already featured until ${user.providerDetails.featuredUntil.toLocaleDateString('en-IN')}`,
      });
    }

    const orderId = `feat_${user._id}_${Date.now()}`;

    const orderRequest = {
      order_id: orderId,
      order_amount: FEATURED_AMOUNT,
      order_currency: 'INR',
      customer_details: {
        customer_id: user._id.toString(),
        customer_name: user.name,
        customer_email: user.email,
        customer_phone: user.phone,
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/provider/featured-status?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL}/api/v1/payments/feature/webhook`,
      },
      order_note: 'Locavo Featured Provider Listing (30 days)',
    };

    const response = await cashfree.PGCreateOrder(orderRequest);
    res.status(200).json({
      success: true,
      data: {
        orderId: response.data.order_id,
        paymentSessionId: response.data.payment_session_id,
        amount: FEATURED_AMOUNT,
      },
    });
  } catch (err) {
    const cashfreeError = err?.response?.data;
    console.error('Cashfree create order error:', JSON.stringify(cashfreeError || err.message, null, 2));
    console.log(err, "error");
    res.status(500).json({
      success: false,
      error: err,
      detail: cashfreeError || null,
    });
  }
};

// ─── Verify Payment after redirect (polling) ─────────────────────────────────

// @desc    Verify payment status by order ID
// @route   GET /api/v1/payments/feature/verify/:orderId
// @access  Private (Provider only)
exports.verifyFeaturePayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const response = await cashfree.PGFetchOrder(orderId);
    const order = response.data;

    if (order.order_status === 'PAID') {
      // Extract provider ID from order_id format: feat_{userId}_{timestamp}
      const parts = orderId.split('_');
      if (parts.length < 2) {
        return res.status(400).json({ success: false, error: 'Invalid order ID format' });
      }
      const providerId = parts[1];

      const user = await User.findById(providerId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Provider not found' });
      }

      // Only activate if not already processed (idempotent)
      if (!user.providerDetails.isFeatured || user.providerDetails.featuredUntil <= new Date()) {
        user.providerDetails.isFeatured = true;
        user.providerDetails.featuredUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await user.save();
      }

      return res.status(200).json({
        success: true,
        status: 'PAID',
        featuredUntil: user.providerDetails.featuredUntil,
      });
    }

    res.status(200).json({
      success: true,
      status: order.order_status, // ACTIVE, EXPIRED, PAID, etc.
    });
  } catch (err) {
    console.error('Cashfree verify error:', err?.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
};

// ─── Webhook (server-to-server, most reliable) ───────────────────────────────

// @desc    Cashfree payment webhook
// @route   POST /api/v1/payments/feature/webhook
// @access  Public (Cashfree servers only — verified by signature)
exports.featurePaymentWebhook = async (req, res) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      return res.status(200).json({ success: false, message: 'Missing headers' });
    }

    // ✅ Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.warn('[WEBHOOK-FEATURE] Signature mismatch — possible spoofed request');
      return res.status(200).json({ success: false, message: 'Invalid signature' });
    }

    const { data, type } = req.body;

    if (type !== 'PAYMENT_SUCCESS_WEBHOOK') {
      return res.status(200).json({ success: true, message: 'Event ignored' });
    }

    const orderId = data?.order?.order_id;
    if (!orderId || !orderId.startsWith('feat_')) {
      return res.status(200).json({ success: true, message: 'Non-feature order, ignored' });
    }

    // ✅ MED-04: Idempotency — skip if already processed
    const alreadyProcessed = await WebhookEvent.exists({ orderId });
    if (alreadyProcessed) {
      console.log('[WEBHOOK-FEATURE] Already processed:', orderId);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }
    // Record before making changes
    await WebhookEvent.create({ orderId, eventType: type });

    const parts = orderId.split('_');
    const providerId = parts[1];

    const user = await User.findById(providerId);
    if (!user) {
      console.error('[WEBHOOK-FEATURE] Provider not found for orderId:', orderId);
      return res.status(200).json({ success: true });
    }

    // ✅ Idempotent update — only extend if currently not featured or expired
    if (!user.providerDetails.isFeatured || user.providerDetails.featuredUntil <= new Date()) {
      user.providerDetails.isFeatured = true;
      user.providerDetails.featuredUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await user.save();
      console.log(`[WEBHOOK-FEATURE] Provider ${user.name} featured until ${user.providerDetails.featuredUntil}`);
    } else {
      console.log(`[WEBHOOK-FEATURE] Provider ${user.name} already featured — no change`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[WEBHOOK-FEATURE] Error:', err);
    res.status(200).json({ success: true });
  }
};
