const express = require('express');
const {
  createBooking,
  getMyBookings,
  acceptBooking,
  rejectBooking,
  confirmPayment,
  startWork,
  uploadJobImages,
  markComplete,
  updateWorkNotes,
  verifyCompletion,
  respondToDispute,
  getMyQuotes,
  cancelBooking,
  rescheduleBooking,
  getProviderPaymentSummary,
  escalateBooking,
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.post('/', authorize('customer'), createBooking);
router.get('/', getMyBookings);
router.get('/provider-payments', authorize('provider'), getProviderPaymentSummary);
router.get('/quotes', getMyQuotes);

router.put('/:id/accept', authorize('provider'), acceptBooking);
router.put('/:id/reject', authorize('provider'), rejectBooking);
router.put('/:id/confirm-payment', authorize('customer'), confirmPayment);
router.put('/:id/start', authorize('provider'), startWork);
router.put('/:id/images', authorize('provider'), uploadJobImages);
router.put('/:id/complete', authorize('provider'), markComplete);
router.put('/:id/notes', authorize('provider'), updateWorkNotes);
router.put('/:id/verify', authorize('customer'), verifyCompletion);
router.put('/:id/dispute-response', authorize('provider'), respondToDispute);
router.put('/:id/cancel', authorize('customer'), cancelBooking);
router.put('/:id/reschedule', authorize('customer'), rescheduleBooking);
router.put('/:id/escalate', escalateBooking);

module.exports = router;
