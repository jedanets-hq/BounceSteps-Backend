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
        services: [],
        pagination: {
          currentPage: 1,
          pages: 0,
          total: 0,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: 20
        },
        message: 'No database connection - Please check database configuration'
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

    if (category && category !== 'all') {
      whereConditions.push(`s.category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (status && status !== 'all') {
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
        COALESCE(s.is_featured, false) as is_featured, 
        COALESCE(s.is_trending, false) as is_trending, 
        COALESCE(s.images, '[]'::jsonb) as images, 
        COALESCE(s.total_bookings, 0) as total_bookings, 
        COALESCE(s.total_favorites, 0) as total_favorites,
        COALESCE(s.search_priority, 0) as search_priority, 
        COALESCE(s.category_priority, 0) as category_priority, 
        COALESCE(s.is_enhanced_listing, false) as is_enhanced_listing,
        COALESCE(s.has_increased_visibility, false) as has_increased_visibility, 
        COALESCE(s.carousel_priority, 0) as carousel_priority, 
        COALESCE(s.has_maximum_visibility, false) as has_maximum_visibility,
        s.promotion_expires_at,
        sp.business_name, sp.id as provider_id,
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
      services: servicesResult.rows,
      pagination: {
        currentPage: parseInt(page),
        pages: totalPages,
        total: totalServices,
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
        stats: {
          total_services: 0,
          featured_services: 0,
          trending_services: 0,
          total_categories: 0,
          active: 0,
          pending: 0
        },
        message: 'No database connection - Please check database configuration'
      });
    }

    const [totalResult, activeResult, pendingResult, featuredResult, trendingResult, categoriesResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM services'),
      pool.query("SELECT COUNT(*) as count FROM services WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) as count FROM services WHERE status = 'pending'"),
      pool.query('SELECT COUNT(*) as count FROM services WHERE is_featured = true'),
      pool.query('SELECT COUNT(*) as count FROM services WHERE is_trending = true'),
      pool.query('SELECT COUNT(DISTINCT category) as count FROM services WHERE category IS NOT NULL')
    ]);

    const stats = {
      total_services: parseInt(totalResult.rows[0].count) || 0,
      featured_services: parseInt(featuredResult.rows[0].count) || 0,
      trending_services: parseInt(trendingResult.rows[0].count) || 0,
      total_categories: parseInt(categoriesResult.rows[0].count) || 0,
      active: parseInt(activeResult.rows[0].count) || 0,
      pending: parseInt(pendingResult.rows[0].count) || 0
    };

    res.json({ success: true, stats });
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
        categories: [],
        message: 'No database connection - Please check database configuration'
      });
    }

    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM services 
      WHERE category IS NOT NULL 
      GROUP BY category 
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      categories: result.rows
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
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: 'No database connection'
      });
    }

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
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Status update simulated'
      });
    }

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

// Toggle service featured status
router.patch('/:id/featured', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Featured status update simulated'
      });
    }

    const { id } = req.params;
    const { is_featured } = req.body;

    const result = await pool.query(
      'UPDATE services SET is_featured = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, is_featured',
      [is_featured, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: `Service ${is_featured ? 'added to' : 'removed from'} featured`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service featured toggle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update featured status',
      error: error.message 
    });
  }
});

// Toggle service trending status
router.patch('/:id/trending', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Trending status update simulated'
      });
    }

    const { id } = req.params;
    const { is_trending } = req.body;

    const result = await pool.query(
      'UPDATE services SET is_trending = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, is_trending',
      [is_trending, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: `Service ${is_trending ? 'added to' : 'removed from'} trending`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service trending toggle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update trending status',
      error: error.message 
    });
  }
});

// Update service promotion settings
router.patch('/:id/promotion', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Promotion settings update simulated'
      });
    }

    const { id } = req.params;
    const {
      search_priority,
      category_priority,
      is_enhanced_listing,
      has_increased_visibility,
      carousel_priority,
      has_maximum_visibility,
      promotion_expires_at
    } = req.body;

    const result = await pool.query(`
      UPDATE services SET 
        search_priority = $1,
        category_priority = $2,
        is_enhanced_listing = $3,
        has_increased_visibility = $4,
        carousel_priority = $5,
        has_maximum_visibility = $6,
        promotion_expires_at = $7,
        updated_at = NOW()
      WHERE id = $8 
      RETURNING id, title
    `, [
      search_priority || 0,
      category_priority || 0,
      is_enhanced_listing || false,
      has_increased_visibility || false,
      carousel_priority || 0,
      has_maximum_visibility || false,
      promotion_expires_at || null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Promotion settings updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service promotion update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update promotion settings',
      error: error.message 
    });
  }
});

// Bulk update services
router.post('/bulk-update', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Bulk update simulated'
      });
    }

    const { service_ids, action, value } = req.body;

    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'service_ids array is required'
      });
    }

    let updateQuery = '';
    let updateParams = [];

    if (action === 'featured') {
      updateQuery = `
        UPDATE services 
        SET is_featured = $1, updated_at = NOW() 
        WHERE id = ANY($2::int[])
      `;
      updateParams = [value, service_ids];
    } else if (action === 'trending') {
      updateQuery = `
        UPDATE services 
        SET is_trending = $1, updated_at = NOW() 
        WHERE id = ANY($2::int[])
      `;
      updateParams = [value, service_ids];
    } else if (action === 'status') {
      updateQuery = `
        UPDATE services 
        SET status = $1, updated_at = NOW() 
        WHERE id = ANY($2::int[])
      `;
      updateParams = [value, service_ids];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be featured, trending, or status'
      });
    }

    const result = await pool.query(updateQuery, updateParams);

    res.json({
      success: true,
      message: `Bulk ${action} update completed for ${result.rowCount} services`,
      data: { service_ids, action, value, updated_count: result.rowCount }
    });
  } catch (error) {
    console.error('Admin service bulk update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to bulk update services',
      error: error.message 
    });
  }
});

// Delete service
router.delete('/:id', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        message: 'No database connection - Service deletion simulated'
      });
    }

    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM services WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Admin service delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete service',
      error: error.message 
    });
  }
});

module.exports = router;