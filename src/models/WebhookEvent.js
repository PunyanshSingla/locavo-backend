const mongoose = require('mongoose');

// ── MED-04: Idempotency store for Cashfree webhooks ───────────────────────────
// Cashfree retries webhooks on failure. We track every processed event
// by its unique ID so we never double-process a payment.
const webhookEventSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: false });

// Auto-expire records after 90 days (TTL index)
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
