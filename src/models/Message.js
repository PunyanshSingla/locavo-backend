const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // bookingId removed to make chat user-user based
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    reactions: [
      {
        emoji: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
      }
    ]
  },
  {
    timestamps: true,
  }
);

// Index for quickly fetching chats between two users
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
