const Message = require('../models/Message');
const Booking = require('../models/Booking');

// @desc    Get chat history with another user
// @route   GET /api/v1/chat/:otherUserId
// @access  Private
exports.getChatHistory = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.id;

    // Fetch messages where sender is currentUser and receiver is otherUser, OR vice versa
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    // Mark messages as read where receiver is the current user and sender is the other user
    await Message.updateMany(
      { senderId: otherUserId, receiverId: currentUserId, read: false },
      { $set: { read: true } }
    );

    res.status(200).json({ success: true, count: messages.length, data: messages });
  } catch (error) {
    console.error('getChatHistory error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
