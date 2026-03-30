const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Get user profile (authenticated)
router.get('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user data
    const userResult = await pool.query(`
      SELECT id, email, first_name, last_name, phone, avatar_url, user_type, is_verified, created_at
      FROM users
      WHERE id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // If user is a service provider, get their provider profile and flatten it
    if (user.user_type === 'service_provider') {
      const providerResult = await pool.query(`
        SELECT * FROM service_providers
        WHERE user_id = $1
      `, [userId]);
      
      if (providerResult.rows.length > 0) {
        const provider = providerResult.rows[0];
        
        // Flatten provider data into user object for easier frontend access
        user.companyName = provider.business_name;
        user.businessName = provider.business_name;
        user.businessType = provider.business_type;
        user.description = provider.description;
        user.serviceLocation = provider.service_location;
        user.serviceCategories = provider.service_categories;
        user.locationData = provider.location_data;
        user.region = provider.region;
        user.district = provider.district;
        user.ward = provider.ward;
        user.area = provider.area;
        user.isVerified = provider.is_verified;
        user.rating = provider.rating;
        user.totalBookings = provider.total_bookings;
        
        // Also keep the nested provider object for backward compatibility
        user.provider = provider;
        
        console.log('✅ Provider profile included and flattened:', {
          business_name: provider.business_name,
          service_location: provider.service_location,
          service_categories: provider.service_categories
        });
      }
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

// Update user profile (authenticated)
router.put('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone, avatar_url } = req.body;
    
    console.log('📝 Updating user profile for user:', userId);
    console.log('📦 Update data:', { first_name, last_name, phone, avatar_url });
    
    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ 
        success: false, 
        message: 'First name and last name are required' 
      });
    }
    
    const result = await pool.query(`
      UPDATE users
      SET first_name = $1,
          last_name = $2,
          phone = $3,
          avatar_url = COALESCE($4, avatar_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, email, first_name, last_name, phone, avatar_url, user_type, is_verified
    `, [first_name, last_name, phone, avatar_url, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    console.log('✅ User profile updated successfully');
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('❌ Update user profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user profile',
      error: error.message 
    });
  }
});

// Update business profile (for service providers)
router.put('/business-profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      business_name, 
      business_type, 
      description 
    } = req.body;
    
    console.log('📝 Updating business profile for user:', userId);
    console.log('📦 Business data:', { business_name, business_type, description });
    console.log('⚠️ NOTE: service_location and service_categories are FIXED and cannot be updated');
    
    // Check if provider profile exists
    const checkResult = await pool.query(
      'SELECT * FROM service_providers WHERE user_id = $1',
      [userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found. Please contact support.'
      });
    } else {
      // Update existing provider profile - ONLY business_name, business_type, and description
      // service_location and service_categories are FIXED from registration
      const result = await pool.query(`
        UPDATE service_providers
        SET business_name = COALESCE($1, business_name),
            business_type = COALESCE($2, business_type),
            description = COALESCE($3, description),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
        RETURNING *
      `, [
        business_name, 
        business_type, 
        description, 
        userId
      ]);
      
      console.log('✅ Business profile updated (location and categories remain fixed)');
      return res.json({ success: true, provider: result.rows[0] });
    }
  } catch (error) {
    console.error('❌ Update business profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update business profile',
      error: error.message 
    });
  }
});

// Change password (authenticated)
router.post('/change-password', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    console.log('🔐 Change password request for user:', userId);
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 6 characters long' 
      });
    }
    
    // Get user's current password
    const userResult = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValidPassword) {
      console.log('❌ Invalid current password');
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    console.log('✅ Password changed successfully for user:', userId);
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password',
      error: error.message 
    });
  }
});

module.exports = router;
