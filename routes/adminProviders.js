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

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Admin providers route working' });
});

module.exports = router;