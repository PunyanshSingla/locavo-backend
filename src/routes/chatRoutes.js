const express = require('express');
const { getChatHistory } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Ensure only authenticated users can fetch chats
router.get('/:otherUserId', getChatHistory);

module.exports = router;
