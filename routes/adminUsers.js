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
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@example.com',
            user_type: 'traveler',
            is_active: true,
            created_at: '2026-03-20T10:00:00Z',
            phone: '+255123456789',
            avatar_url: null,
            total_bookings: 5
          },
          {
            id: 2,
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane.smith@example.com',
            user_type: 'service_provider',
            is_active: true,
            created_at: '2026-03-19T14:30:00Z',
            phone: '+255987654321',
            avatar_url: null,
            total_bookings: 0,
            business_name: 'Safari Adventures Ltd'
          }
        ].slice(0, parseInt(req.query.limit || 20)),
        pagination: {
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 20,
          total: 1250,
          totalPages: 63
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
      whereConditions.push(`(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (userType) {
      whereConditions.push(`u.user_type = $${paramIndex}`);
      queryParams.push(userType);
      paramIndex++;
    }

    if (status) {
      const isActive = status === 'active';
      whereConditions.push(`u.is_active = $${paramIndex}`);
      queryParams.push(isActive);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get users with pagination
    const usersQuery = `
      SELECT 
        u.id, 
        u.first_name,
        u.last_name,
        u.email, 
        u.user_type, 
        u.is_active,
        u.created_at, 
        u.updated_at,
        u.phone, 
        u.avatar_url,
        sp.business_name,
        (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as total_bookings
      FROM users u
      LEFT JOIN service_providers sp ON u.id = sp.user_id
      ${whereClause}
      ORDER BY u.created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(parseInt(limit), offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM users u
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
        totalPages
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
        u.id, 
        u.first_name,
        u.last_name,
        u.email, 
        u.user_type, 
        u.is_active,
        u.created_at, 
        u.updated_at,
        u.phone, 
        u.avatar_url,
        sp.business_name,
        (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as total_bookings
      FROM users u
      LEFT JOIN service_providers sp ON u.id = sp.user_id
      WHERE u.id = $1
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
      RETURNING id, first_name, last_name, email, is_active
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

    console.log(`Suspending user ${id}, reason:`, reason);

    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('User suspended:', result.rows[0]);
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

    console.log(`Restoring user ${id}`);

    const result = await pool.query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('User restored:', result.rows[0]);
    res.json({ success: true, message: 'User restored successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin user restore error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore user', error: error.message });
  }
});

// Delete user permanently
router.delete('/:id', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'User deleted permanently (demo mode)',
        user: { id: req.params.id, deleted: true }
      });
    }

    const { id } = req.params;

    console.log(`Permanently deleting user ${id}`);

    // First check if user exists
    const userCheck = await pool.query('SELECT id, email, user_type FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userCheck.rows[0];

    // Start transaction for safe deletion
    await pool.query('BEGIN');

    try {
      // Delete related records first (to avoid foreign key constraints)
      
      // Delete user's bookings
      await pool.query('DELETE FROM bookings WHERE user_id = $1', [id]);
      
      // Delete user's traveler stories
      await pool.query('DELETE FROM traveler_stories WHERE user_id = $1', [id]);
      
      // Delete user's favorites
      await pool.query('DELETE FROM favorites WHERE user_id = $1', [id]);
      
      // If user is a service provider, delete provider-related data
      if (user.user_type === 'service_provider') {
        // Delete services provided by this user
        await pool.query('DELETE FROM services WHERE provider_id IN (SELECT id FROM service_providers WHERE user_id = $1)', [id]);
        
        // Delete service provider record
        await pool.query('DELETE FROM service_providers WHERE user_id = $1', [id]);
      }
      
      // Finally delete the user
      const result = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email, user_type',
        [id]
      );

      // Commit transaction
      await pool.query('COMMIT');

      console.log('User deleted permanently:', result.rows[0]);
      
      res.json({ 
        success: true, 
        message: 'User deleted permanently', 
        data: { 
          id: result.rows[0].id, 
          email: result.rows[0].email,
          user_type: result.rows[0].user_type,
          deleted: true 
        } 
      });

    } catch (deleteError) {
      // Rollback transaction on error
      await pool.query('ROLLBACK');
      throw deleteError;
    }

  } catch (error) {
    console.error('Admin user delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user permanently', 
      error: error.message 
    });
  }
});

module.exports = router;
