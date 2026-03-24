const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Get all favorites for authenticated user
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT f.*, 
             -- Provider data (if favorited provider)
             sp.id as provider_id,
             sp.business_name,
             sp.business_type,
             sp.description as provider_description,
             sp.location as provider_location,
             sp.region as provider_region,
             sp.district as provider_district,
             sp.area as provider_area,
             sp.rating,
             sp.service_categories,
             u.first_name as provider_first_name,
             u.last_name as provider_last_name,
             u.email as provider_email,
             -- Service data (if favorited service)
             s.id as service_id,
             s.title as service_title,
             s.description as service_description,
             s.category as service_category,
             s.price as service_price,
             s.currency as service_currency,
             s.duration as service_duration,
             s.location as service_location,
             s.region as service_region,
             s.district as service_district,
             s.area as service_area,
             s.images as service_images,
             s.amenities as service_amenities,
             s.average_rating as service_rating,
             s.is_active as service_is_active,
             -- Service provider info for services
             sp2.id as service_provider_id,
             sp2.business_name as service_provider_name
      FROM favorites f
      LEFT JOIN service_providers sp ON f.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN services s ON f.service_id = s.id
      LEFT JOIN service_providers sp2 ON s.provider_id = sp2.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
    `, [userId]);
    
    res.json({ success: true, favorites: result.rows });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ success: false, message: 'Failed to get favorites' });
  }
});

// Add provider or service to favorites
router.post('/add', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { providerId, serviceId } = req.body;
    
    // Validate that either providerId or serviceId is provided (not both, not neither)
    if ((!providerId && !serviceId) || (providerId && serviceId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either providerId or serviceId must be provided (not both)' 
      });
    }
    
    // Add to favorites (or ignore if already exists)
    let result;
    if (providerId) {
      result = await pool.query(`
        INSERT INTO favorites (user_id, provider_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [userId, providerId]);
    } else {
      result = await pool.query(`
        INSERT INTO favorites (user_id, service_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [userId, serviceId]);
    }
    
    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Added to favorites', favorite: result.rows[0] });
    } else {
      res.json({ success: true, message: 'Already in favorites' });
    }
  } catch (error) {
    console.error('Add to favorites error:', error);
    res.status(500).json({ success: false, message: 'Failed to add to favorites' });
  }
});

// Remove from favorites (provider or service)
router.delete('/:type/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, id } = req.params;
    
    let result;
    if (type === 'provider') {
      result = await pool.query(`
        DELETE FROM favorites
        WHERE user_id = $1 AND provider_id = $2
        RETURNING *
      `, [userId, id]);
    } else if (type === 'service') {
      result = await pool.query(`
        DELETE FROM favorites
        WHERE user_id = $1 AND service_id = $2
        RETURNING *
      `, [userId, id]);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid type. Use "provider" or "service"' });
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Favorite not found' });
    }
    
    res.json({ success: true, message: 'Removed from favorites' });
  } catch (error) {
    console.error('Remove from favorites error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from favorites' });
  }
});

// Legacy endpoint for backward compatibility
router.delete('/:providerId', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const providerId = req.params.providerId;
    
    const result = await pool.query(`
      DELETE FROM favorites
      WHERE user_id = $1 AND provider_id = $2
      RETURNING *
    `, [userId, providerId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Favorite not found' });
    }
    
    res.json({ success: true, message: 'Removed from favorites' });
  } catch (error) {
    console.error('Remove from favorites error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from favorites' });
  }
});

// Check if provider or service is favorited
router.get('/check/:type/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, id } = req.params;
    
    let result;
    if (type === 'provider') {
      result = await pool.query(`
        SELECT id FROM favorites
        WHERE user_id = $1 AND provider_id = $2
      `, [userId, id]);
    } else if (type === 'service') {
      result = await pool.query(`
        SELECT id FROM favorites
        WHERE user_id = $1 AND service_id = $2
      `, [userId, id]);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid type. Use "provider" or "service"' });
    }
    
    res.json({ success: true, isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ success: false, message: 'Failed to check favorite' });
  }
});

// Legacy endpoint for backward compatibility
router.get('/check/:providerId', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const providerId = req.params.providerId;
    
    const result = await pool.query(`
      SELECT id FROM favorites
      WHERE user_id = $1 AND provider_id = $2
    `, [userId, providerId]);
    
    res.json({ success: true, isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ success: false, message: 'Failed to check favorite' });
  }
});

module.exports = router;
