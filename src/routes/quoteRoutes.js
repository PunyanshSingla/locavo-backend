const express = require('express');
const { requestQuote, getQuotes, replyQuote } = require('../controllers/quoteController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', requestQuote);
router.get('/', getQuotes);
router.put('/:id/reply', replyQuote);

module.exports = router;
