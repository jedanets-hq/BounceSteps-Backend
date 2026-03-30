const express = require('express');
const router = express.Router();
const passport = require('passport');
const { Message, User } = require('../models');

// Middleware to protect routes with JWT
const authenticate = passport.authenticate('jwt', { session: false });

// Get all conversations for current user
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await Message.getConversations(userId);
    
    res.json({
      success: true,
      conversations: conversations.map(c => ({
        otherUserId: c.other_user_id,
        otherUserName: `${c.first_name} ${c.last_name}`,
        otherUserAvatar: c.avatar_url,
        lastMessage: c.last_message,
        lastMessageTime: c.last_message_time,
        isRead: c.is_read
      }))
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
});

// Get message history for a specific conversation
router.get('/conversation/:otherUserId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.otherUserId;
    
    const messages = await Message.getConversation(userId, otherUserId);
    
    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        text: m.message_text,
        senderType: m.sender_type,
        senderName: m.sender_name,
        timestamp: m.created_at,
        isMe: (m.sender_type === 'traveller' && m.traveller_id === userId) || 
              (m.sender_type === 'provider' && m.provider_id === userId)
      }))
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// Send a new message
router.post('/send', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId, messageText, serviceId } = req.body;
    const userType = req.user.userType === 'traveler' ? 'traveller' : 'provider';

    if (!messageText || !otherUserId) {
      return res.status(400).json({ success: false, message: 'Recipient and message text are required' });
    }

    const messageData = {
      traveller_id: userType === 'traveller' ? userId : otherUserId,
      provider_id: userType === 'provider' ? userId : otherUserId,
      service_id: serviceId,
      sender_type: userType,
      message_text: messageText
    };

    const newMessage = await Message.create(messageData);

    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Get unread message count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await Message.getUnreadCount(userId);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

module.exports = router;