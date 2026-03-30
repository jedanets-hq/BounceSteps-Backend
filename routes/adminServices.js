const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin services');
}

// Get services with pagination and filtering
router.get('/', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: [
          {
            id: 1,
            title: 'Serengeti Safari Experience',
            description: '3-day wildlife safari in Serengeti National Park',
            category: 'Wildlife Safari',
            price: 850,
            duration: '3 days',
            location: 'Serengeti, Tanzania',
            status: 'active',
            created_at: '2026-03-15T09:00:00Z',
            updated_at: '2026-03-15T09:00:00Z',
            provider_name: 'Safari Adventures Ltd',
            provider_id: 1,
            provider_email: 'info@safariadventures.com'
          },
          {
            id: 2,
            title: 'Kilimanjaro Base Camp Trek',
            description: '5-day trekking adventure to Kilimanjaro base camp',
            category: 'Mountain Trekking',
            price: 1200,
            duration: '5 days',
            location: 'Kilimanjaro, Tanzania',
            status: 'pending',
            created_at: '2026-03-14T11:30:00Z',
            updated_at: '2026-03-14T11:30:00Z',
            provider_name: 'Mountain Trekking Co',
            provider_id: 2,
            provider_email: 'contact@mountaintrek.com'
          }
        ].slice(0, parseInt(req.query.limit || 20)),
        pages: 8,
        total: 156,
        pagination: {
          currentPage: parseInt(req.query.page) || 1,
          totalPages: 8,
          totalItems: 156,
          itemsPerPage: parseInt(req.query.limit) || 20
        },
        message: 'Demo data - Connect database for live service data'
      });
    }

    const { 
      page = 1, 
      limit = 20,
      search = '',
      category = '',
      status = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(s.title ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`s.category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`s.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get services with provider info
    const servicesQuery = `
      SELECT 
        s.id, s.title, s.description, s.category, s.price,
        s.duration, s.location, s.status, s.created_at, s.updated_at,
        sp.business_name as provider_name, sp.id as provider_id,
        u.email as provider_email
      FROM services s
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(parseInt(limit), offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM services s
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      ${whereClause}
    `;

    const [servicesResult, countResult] = await Promise.all([
      pool.query(servicesQuery, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2))
    ]);

    const totalServices = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalServices / parseInt(limit));

    res.json({
      success: true,
      data: servicesResult.rows,
      pages: totalPages,
      total: totalServices,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalServices,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Admin services error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch services',
      error: error.message 
    });
  }
});

// Get service statistics
router.get('/stats', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: {
          total: 156,
          active: 142,
          pending: 14,
          categories: [
            { category: 'Wildlife Safari', count: 45 },
            { category: 'Mountain Trekking', count: 32 },
            { category: 'Cultural Tours', count: 28 },
            { category: 'Beach Activities', count: 25 },
            { category: 'Adventure Sports', count: 26 }
          ],
          message: 'Demo data - Connect database for live statistics'
        }
      });
    }

    const [totalResult, activeResult, pendingResult, categoriesResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM services'),
      pool.query("SELECT COUNT(*) as count FROM services WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) as count FROM services WHERE status = 'pending'"),
      pool.query('SELECT category, COUNT(*) as count FROM services GROUP BY category ORDER BY count DESC')
    ]);

    const stats = {
      total: parseInt(totalResult.rows[0].count) || 0,
      active: parseInt(activeResult.rows[0].count) || 0,
      pending: parseInt(pendingResult.rows[0].count) || 0,
      categories: categoriesResult.rows
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Admin services stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch service statistics',
      error: error.message 
    });
  }
});

// Get service categories
router.get('/categories', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: [
          { category: 'Wildlife Safari', service_count: 45, avg_price: 750 },
          { category: 'Mountain Trekking', service_count: 32, avg_price: 950 },
          { category: 'Cultural Tours', service_count: 28, avg_price: 450 },
          { category: 'Beach Activities', service_count: 25, avg_price: 350 },
          { category: 'Adventure Sports', service_count: 26, avg_price: 650 }
        ],
        message: 'Demo data - Connect database for live categories'
      });
    }

    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as service_count,
        AVG(price) as avg_price
      FROM services 
      WHERE category IS NOT NULL 
      GROUP BY category 
      ORDER BY service_count DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Admin service categories error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch service categories',
      error: error.message 
    });
  }
});

// Get single service by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const serviceQuery = `
      SELECT 
        s.*, 
        sp.business_name as provider_name, sp.id as provider_id,
        u.email as provider_email, u.first_name, u.last_name
      FROM services s
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE s.id = $1
    `;

    const result = await pool.query(serviceQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch service',
      error: error.message 
    });
  }
});

// Update service status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'inactive', 'pending', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const result = await pool.query(
      'UPDATE services SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: `Service status updated to ${status}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service status update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update service status',
      error: error.message 
    });
  }
});

module.exports = router;