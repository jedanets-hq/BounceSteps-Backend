const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin users');
}

// Get users with pagination and filtering
router.get('/', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: [
          {
            id: 1,
            name: 'John Doe',
            email: 'john.doe@example.com',
            user_type: 'traveler',
            status: 'active',
            created_at: '2026-03-20T10:00:00Z',
            phone: '+255123456789',
            profile_image: null,
            location: 'Dar es Salaam'
          },
          {
            id: 2,
            name: 'Jane Smith',
            email: 'jane.smith@example.com',
            user_type: 'provider',
            status: 'active',
            created_at: '2026-03-19T14:30:00Z',
            phone: '+255987654321',
            profile_image: null,
            location: 'Arusha'
          }
        ].slice(0, parseInt(req.query.limit || 20)),
        pagination: {
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 20,
          total: 1250,
          totalPages: 63,
          hasNext: true,
          hasPrev: false
        },
        message: 'Demo data - Connect database for live user data'
      });
    }

    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      userType = '', 
      status = '' 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (userType) {
      whereConditions.push(`user_type = $${paramIndex}`);
      queryParams.push(userType);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get users with pagination
    const usersQuery = `
      SELECT 
        id, 
        first_name || ' ' || last_name as name,
        email, 
        user_type, 
        CASE 
          WHEN is_active = true THEN 'active'
          ELSE 'inactive'
        END as status,
        created_at, 
        updated_at,
        phone, 
        avatar_url as profile_image, 
        'N/A' as location
      FROM users 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(parseInt(limit), offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2); // Remove limit and offset

    const [usersResult, countResult] = await Promise.all([
      pool.query(usersQuery, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const users = usersResult.rows;
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get single user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, 
        first_name || ' ' || last_name as name,
        email, 
        user_type, 
        CASE 
          WHEN is_active = true THEN 'active'
          ELSE 'inactive'
        END as status,
        created_at, 
        updated_at,
        phone, 
        avatar_url as profile_image, 
        'N/A' as location,
        'N/A' as bio
      FROM users 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Admin user fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Update user status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or suspended'
      });
    }

    const result = await pool.query(`
      UPDATE users 
      SET is_active = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING id, first_name || ' ' || last_name as name, email, 
      CASE 
        WHEN is_active = true THEN 'active'
        ELSE 'inactive'
      END as status
    `, [status === 'active', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Admin user status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

// Suspend user
router.post('/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User suspended successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin user suspend error:', error);
    res.status(500).json({ success: false, message: 'Failed to suspend user', error: error.message });
  }
});

// Restore user
router.post('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User restored successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin user restore error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore user', error: error.message });
  }
});

module.exports = router;