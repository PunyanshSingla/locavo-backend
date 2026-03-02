const express = require('express');
const { updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth middleware to all routes mapped to this router
router.use(protect);

router.put('/profile', updateProfile);

module.exports = router;
