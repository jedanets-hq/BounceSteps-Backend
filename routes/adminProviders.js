const express = require('express');
const router = express.Router();
const { pool } = require('../config/postgresql');

// Get providers with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      hasBadge = '' 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(sp.business_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (hasBadge !== '') {
      whereConditions.push(`sp.is_verified = $${paramIndex}`);
      queryParams.push(hasBadge === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get providers with user info
    const providersQuery = `
      SELECT 
        sp.id, sp.business_name, sp.business_type, sp.description,
        sp.location, sp.service_location, sp.country, sp.region,
        sp.district, sp.area, sp.ward, sp.is_verified, sp.rating,
        sp.total_bookings, sp.created_at, sp.updated_at,
        u.email, u.first_name, u.last_name, u.phone, u.is_active
      FROM service_providers sp
      LEFT JOIN users u ON sp.user_id = u.id
      ${whereClause}
      ORDER BY sp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(parseInt(limit), offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM service_providers sp
      LEFT JOIN users u ON sp.user_id = u.id
      ${whereClause}
    `;

    const [providersResult, countResult] = await Promise.all([
      pool.query(providersQuery, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2)) // Remove limit and offset for count
    ]);

    const totalProviders = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalProviders / parseInt(limit));

    res.json({
      success: true,
      data: {
        providers: providersResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalProviders,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin providers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch providers',
      error: error.message 
    });
  }
});

// Get single provider by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const providerQuery = `
      SELECT 
        sp.*, 
        u.email, u.first_name, u.last_name, u.phone, u.is_active,
        u.created_at as user_created_at
      FROM service_providers sp
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE sp.id = $1
    `;

    const result = await pool.query(providerQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin provider by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch provider',
      error: error.message 
    });
  }
});

// Update provider verification status
router.patch('/:id/verification', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;

    const result = await pool.query(
      'UPDATE service_providers SET is_verified = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [is_verified, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.json({
      success: true,
      message: `Provider ${is_verified ? 'verified' : 'unverified'} successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin provider verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update provider verification',
      error: error.message 
    });
  }
});

// Verify provider (POST for Verification.jsx compatibility)
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE service_providers SET is_verified = true, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    res.json({
      success: true,
      message: 'Provider verified successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin provider verify error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify provider', error: error.message });
  }
});

// Unverify provider (POST for Verification.jsx compatibility)
router.post('/:id/unverify', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE service_providers SET is_verified = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    res.json({
      success: true,
      message: 'Provider verification revoked',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin provider unverify error:', error);
    res.status(500).json({ success: false, message: 'Failed to unverify provider', error: error.message });
  }
});

// Assign badge to provider
router.post('/:id/badge', async (req, res) => {
  try {
    const { id } = req.params;
    const { badgeType, notes } = req.body;

    const validBadges = ['verified', 'premium', 'top_rated', 'eco_friendly', 'local_expert'];
    if (!validBadges.includes(badgeType)) {
      return res.status(400).json({ success: false, message: 'Invalid badge type' });
    }

    // Try to update badge_type column if it exists, otherwise use is_verified
    let result;
    try {
      result = await pool.query(
        'UPDATE service_providers SET badge_type = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [badgeType, id]
      );
    } catch (err) {
      // Fall back to is_verified if badge_type column doesn't exist
      result = await pool.query(
        'UPDATE service_providers SET is_verified = true, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    res.json({ success: true, message: 'Badge assigned successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin provider badge error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign badge', error: error.message });
  }
});

// Remove badge from provider
router.delete('/:id/badge', async (req, res) => {
  try {
    const { id } = req.params;

    let result;
    try {
      result = await pool.query(
        'UPDATE service_providers SET badge_type = NULL, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id]
      );
    } catch (err) {
      result = await pool.query(
        'UPDATE service_providers SET is_verified = false, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    res.json({ success: true, message: 'Badge removed successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin provider badge remove error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove badge', error: error.message });
  }
});

module.exports = router;