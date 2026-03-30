const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Get all providers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sp.*, 
        u.email, 
        u.first_name, 
        u.last_name, 
        u.phone, 
        u.avatar_url,
        COALESCE(
          json_agg(
            json_build_object(
              'badge_type', pb.badge_type,
              'assigned_at', pb.assigned_at
            )
          ) FILTER (WHERE pb.badge_type IS NOT NULL),
          '[]'
        ) as badges
      FROM service_providers sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN provider_badges pb ON sp.id = pb.provider_id
      WHERE u.is_active = true
      GROUP BY sp.id, u.id
      ORDER BY sp.rating DESC, sp.created_at DESC
    `);
    
    // Add cache-control headers to prevent stale data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({ success: true, providers: result.rows });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get providers' });
  }
});

// Get my followers (for service providers) - MUST BE BEFORE /:id route
router.get('/my-followers', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📊 Fetching followers for user:', userId);

    // First get the service_provider.id for this user
    const providerResult = await pool.query(`
      SELECT id FROM service_providers WHERE user_id = $1
    `, [userId]);

    if (providerResult.rows.length === 0) {
      console.log('⚠️ No provider record found for user:', userId);
      return res.json({ 
        success: true, 
        followers: [],
        count: 0
      });
    }

    const providerId = providerResult.rows[0].id;
    console.log('✅ Found provider ID:', providerId);

    const result = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, pf.followed_at
      FROM provider_followers pf
      JOIN users u ON pf.follower_id = u.id
      WHERE pf.provider_id = $1
      ORDER BY pf.followed_at DESC
    `, [providerId]);

    console.log(`✅ Found ${result.rows.length} followers`);

    res.json({ 
      success: true, 
      followers: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Get my followers error:', error);
    res.status(500).json({ success: false, message: 'Failed to get followers' });
  }
});

// Get provider by ID with their services
router.get('/:id', async (req, res) => {
  try {
    // Check if :id is actually a number (to avoid catching /my-followers)
    const providerId = parseInt(req.params.id);
    if (isNaN(providerId)) {
      return res.status(400).json({ success: false, message: 'Invalid provider ID' });
    }
    
    console.log('📋 Fetching provider details for ID:', providerId);
    
    // CRITICAL: services.provider_id references service_providers.id (NOT users.id)
    // So we need to find the provider by service_providers.id
    const providerResult = await pool.query(`
      SELECT 
        sp.*, 
        u.email, 
        u.first_name, 
        u.last_name, 
        u.phone, 
        u.avatar_url, 
        u.is_verified,
        pb.badge_type,
        pb.assigned_at as badge_assigned_at,
        pb.notes as badge_notes
      FROM service_providers sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN provider_badges pb ON sp.id = pb.provider_id
      WHERE sp.id = $1 AND u.is_active = true
    `, [providerId]);
    
    console.log('📊 Provider query result:', providerResult.rows.length, 'rows');
    
    if (providerResult.rows.length === 0) {
      console.log('❌ Provider not found for service_providers.id:', providerId);
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    
    const provider = providerResult.rows[0];
    console.log('✅ Provider found:', provider.business_name);
    console.log('   service_providers.id:', provider.id);
    console.log('   user_id:', provider.user_id);
    
    // Get provider's services from services table
    // CRITICAL: services.provider_id references service_providers.id
    const servicesResult = await pool.query(`
      SELECT s.id,
             s.title,
             s.category,
             s.price,
             s.location,
             s.region,
             s.district,
             s.area,
             s.duration,
             s.max_participants,
             s.status,
             s.is_active,
             s.is_featured,
             s.created_at,
             s.description,
             CASE 
               WHEN s.images IS NULL OR s.images = '' OR s.images = '[]' THEN '[]'::jsonb
               WHEN s.images::text ~ '^\\[.*\\]$' THEN s.images::jsonb
               ELSE jsonb_build_array(s.images)
             END as images,
             s.amenities,
             s.payment_methods,
             s.contact_info,
             $2 as provider_user_id,
             sp.business_name,
             sp.id as provider_id,
             COUNT(DISTINCT b.id) as review_count,
             AVG(b.rating) as average_rating
      FROM services s
      LEFT JOIN bookings b ON s.id = b.service_id
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      WHERE s.provider_id = $1 AND s.is_active = true
      GROUP BY s.id, sp.id, sp.business_name
      ORDER BY s.created_at DESC
    `, [provider.id, provider.user_id]);
    
    console.log('📦 Services found:', servicesResult.rows.length);
    
    if (servicesResult.rows.length > 0) {
      console.log('📦 Sample service data:', {
        id: servicesResult.rows[0].id,
        title: servicesResult.rows[0].title,
        provider_user_id: servicesResult.rows[0].provider_user_id,
        provider_id: servicesResult.rows[0].provider_id,
        business_name: servicesResult.rows[0].business_name
      });
      console.log('📦 Full first service:', JSON.stringify(servicesResult.rows[0], null, 2));
    }
    
    // Add services to provider object
    provider.services = servicesResult.rows;
    provider.services_count = servicesResult.rows.length;
    
    // Add cache-control headers to prevent stale data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({ success: true, provider: provider });
  } catch (error) {
    console.error('❌ Get provider error:', error);
    res.status(500).json({ success: false, message: 'Failed to get provider', error: error.message });
  }
});

// Follow a provider
router.post('/:id/follow', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const providerId = req.params.id;
    const userId = req.user.id;

    console.log('👤 User', userId, 'following provider', providerId);

    // Check if already following
    const checkResult = await pool.query(
      'SELECT * FROM provider_followers WHERE provider_id = $1 AND follower_id = $2',
      [providerId, userId]
    );

    if (checkResult.rows.length > 0) {
      return res.json({ success: false, message: 'Already following this provider' });
    }

    // Add follower
    await pool.query(
      'INSERT INTO provider_followers (provider_id, follower_id, followed_at) VALUES ($1, $2, NOW())',
      [providerId, userId]
    );

    // Get updated follower count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM provider_followers WHERE provider_id = $1',
      [providerId]
    );

    res.json({ 
      success: true, 
      message: 'Successfully followed provider',
      followers_count: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Follow provider error:', error);
    res.status(500).json({ success: false, message: 'Failed to follow provider' });
  }
});

// Unfollow a provider
router.post('/:id/unfollow', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const providerId = req.params.id;
    const userId = req.user.id;

    console.log('👤 User', userId, 'unfollowing provider', providerId);

    // Remove follower
    const result = await pool.query(
      'DELETE FROM provider_followers WHERE provider_id = $1 AND follower_id = $2 RETURNING *',
      [providerId, userId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'You are not following this provider' });
    }

    // Get updated follower count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM provider_followers WHERE provider_id = $1',
      [providerId]
    );

    res.json({ 
      success: true, 
      message: 'Successfully unfollowed provider',
      followers_count: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Unfollow provider error:', error);
    res.status(500).json({ success: false, message: 'Failed to unfollow provider' });
  }
});

// Get follower count for a provider
router.get('/:id/followers/count', async (req, res) => {
  try {
    const providerId = req.params.id;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM provider_followers WHERE provider_id = $1',
      [providerId]
    );

    res.json({ 
      success: true, 
      count: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Get follower count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get follower count' });
  }
});

module.exports = router;
