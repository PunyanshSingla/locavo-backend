const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication error: No token provided'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.error('[SOCKET AUTH] User not found:', decoded.id);
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('[SOCKET AUTH] Invalid token:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.user.name} (${socket.user.id})`);

    const getRoomName = (id1, id2) => {
      return `chat_${[id1.toString(), id2.toString()].sort().join('_')}`;
    };

    // Join a specific user-to-user chat room
    socket.on('join_chat', ({ otherUserId }) => {
      if (!otherUserId) return;
      const room = getRoomName(socket.user.id, otherUserId);
      socket.join(room);
      console.log(`[SOCKET] User ${socket.user.id} joined room ${room}`);
    });

    // Handle sending a new message
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content } = data;
        if (!receiverId || !content) {
          return socket.emit('error', 'Missing message data (receiverId, content)');
        }

        // Save to DB
        const message = await Message.create({
          senderId: socket.user.id,
          receiverId,
          content,
          read: false,
        });

        const room = getRoomName(socket.user.id, receiverId);
        // Broadcast to everyone in the room (including sender to confirm)
        io.to(room).emit('receive_message', message);
      } catch (err) {
        console.error('[SOCKET] Error saving message:', err);
        socket.emit('error', 'Failed to send message');
      }
    });

    // Handle marking messages as read
    socket.on('mark_read', async ({ otherUserId, messageIds }) => {
      try {
        if (!messageIds || !messageIds.length) return;
        
        await Message.updateMany(
          { _id: { $in: messageIds }, receiverId: socket.user.id },
          { $set: { read: true } }
        );

        const room = getRoomName(socket.user.id, otherUserId);
        // Notify room that messages were read (so sender's UI can update)
        socket.to(room).emit('messages_read', {
          readerId: socket.user.id,
          messageIds,
        });
      } catch (err) {
        console.error('[SOCKET] Error marking read:', err);
      }
    });

    // Handle toggling emojis on a message
    socket.on('toggle_reaction', async ({ messageId, emoji, otherUserId }) => {
      try {
        if (!messageId || !emoji || !otherUserId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        const existingReactionIndex = message.reactions.findIndex(
          (r) => r.emoji === emoji && r.userId.toString() === socket.user.id
        );

        if (existingReactionIndex > -1) {
          // Remove if exists
          message.reactions.splice(existingReactionIndex, 1);
        } else {
          // Add if doesn't exist
          message.reactions.push({ emoji, userId: socket.user.id });
        }

        await message.save();

        const room = getRoomName(socket.user.id, otherUserId);
        io.to(room).emit('message_reaction_updated', {
          messageId,
          reactions: message.reactions,
        });
      } catch (err) {
        console.error('[SOCKET] Error toggling reaction:', err);
      }
    });

    // Leave chat room
    socket.on('leave_chat', ({ otherUserId }) => {
      if (!otherUserId) return;
      const room = getRoomName(socket.user.id, otherUserId);
      socket.leave(room);
      console.log(`[SOCKET] User ${socket.user.id} left room ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${socket.user.name}`);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) throw new Error('Socket.io not initialized!');
  return io;
};

module.exports = { initSocket, getIo };
