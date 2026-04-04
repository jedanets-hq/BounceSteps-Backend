const express = require('express');
const router = express.Router();
const passport = require('passport');
const { Message, User, pool } = require('../models');

// Middleware to protect routes with JWT
const authenticate = passport.authenticate('jwt', { session: false });

// Get all conversations for current user
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📥 [BACKEND] Fetching conversations for user:', userId, 'type:', req.user.userType);
    
    const conversations = await Message.getConversations(userId);
    console.log('📦 [BACKEND] Raw conversations:', conversations);
    
    const mappedConversations = conversations.map(c => ({
      otherUserId: c.other_user_id,
      other_user_id: c.other_user_id,
      first_name: c.first_name,
      last_name: c.last_name,
      business_name: c.business_name,
      avatar_url: c.avatar_url,
      last_message: c.last_message,
      last_message_time: c.last_message_time,
      isRead: c.is_read,
      unread_count: 0 // TODO: implement unread count
    }));
    
    console.log('📋 [BACKEND] Mapped conversations:', mappedConversations);
    
    res.json({
      success: true,
      conversations: mappedConversations
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
    
    console.log('📥 [BACKEND] Fetching messages between:', userId, 'and', otherUserId);
    
    // Validate otherUserId
    if (!otherUserId || otherUserId === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid recipient ID' 
      });
    }

    // Ensure messages table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        traveller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('traveller', 'provider')),
        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const messages = await Message.getConversation(userId, otherUserId);
    console.log('📦 [BACKEND] Raw messages:', messages);
    
    const mappedMessages = messages.map(m => ({
      id: m.id,
      text: m.message_text,
      message_text: m.message_text,
      senderType: m.sender_type,
      sender_type: m.sender_type,
      senderName: m.sender_name,
      timestamp: m.created_at,
      created_at: m.created_at,
      isMe: (m.sender_type === 'traveller' && m.traveller_id === userId) || 
            (m.sender_type === 'provider' && m.provider_id === userId)
    }));
    
    console.log('📋 [BACKEND] Mapped messages:', mappedMessages);
    
    res.json({
      success: true,
      messages: mappedMessages
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
    
    // Validate required fields
    if (!messageText || !otherUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Recipient and message text are required' 
      });
    }

    // Validate otherUserId is not undefined
    if (otherUserId === 'undefined' || !otherUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid recipient ID' 
      });
    }

    // Get the other user's information to determine their type
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Recipient not found' 
      });
    }

    // Ensure messages table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        traveller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('traveller', 'provider')),
        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const senderType = req.user.userType === 'traveler' ? 'traveller' : 'provider';
    const otherUserType = otherUser.user_type === 'traveler' ? 'traveller' : 'service_provider';

    // Correctly assign traveller_id and provider_id based on actual user types
    let travellerId, providerId;
    
    if (req.user.userType === 'traveler') {
      travellerId = userId;
      providerId = otherUserId;
    } else if (req.user.userType === 'service_provider') {
      providerId = userId;
      travellerId = otherUserId;
    } else {
      // Handle case where we need to determine based on other user
      if (otherUser.user_type === 'traveler') {
        travellerId = otherUserId;
        providerId = userId;
      } else {
        travellerId = userId;
        providerId = otherUserId;
      }
    }

    const messageData = {
      traveller_id: travellerId,
      provider_id: providerId,
      service_id: serviceId,
      sender_type: senderType,
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