const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin services');
}

// Get all services with filtering and search
router.get('/', async (req, res) => {
  try {
    // Check if database pool is available
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }
    
    const { 
      page = 1, 
      limit = 20, 
      category, 
      search, 
      status,
      is_featured,
      is_trending 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    if (category && category !== 'all') {
      whereConditions.push(`s.category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }
    
    if (search) {
      whereConditions.push(`(s.title ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex} OR sp.business_name ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status) {
      whereConditions.push(`s.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    if (is_featured !== undefined) {
      whereConditions.push(`s.is_featured = $${paramIndex}`);
      queryParams.push(is_featured === 'true');
      paramIndex++;
    }
    
    if (is_trending !== undefined) {
      whereConditions.push(`s.is_trending = $${paramIndex}`);
      queryParams.push(is_trending === 'true');
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM services s
      INNER JOIN service_providers sp ON s.provider_id = sp.id
      INNER JOIN users u ON sp.user_id = u.id
      ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].total);
    
    // Get services with pagination - using s.* to get all service fields including images
    queryParams.push(limit, offset);
    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const result = await pool.query(`
      SELECT 
        s.id,
        s.provider_id,
        s.title,
        s.description,
        s.category,
        s.price,
        s.duration,
        s.location,
        s.status,
        s.is_featured,
        s.is_trending,
        s.images,
        s.total_bookings,
        s.total_favorites,
        s.search_priority,
        s.category_priority,
        s.is_enhanced_listing,
        s.has_increased_visibility,
        s.carousel_priority,
        s.has_maximum_visibility,
        s.promotion_expires_at,
        s.created_at,
        s.updated_at,
        sp.id as service_provider_id,
        sp.business_name,
        sp.business_type,
        sp.location as provider_location,
        sp.rating as provider_rating,
        sp.is_verified as provider_verified,
        u.first_name as provider_first_name,
        u.last_name as provider_last_name,
        u.email as provider_email,
        u.avatar_url,
        u.is_verified as user_verified,
        pb.badge_type as provider_badge_type
      FROM services s
      INNER JOIN service_providers sp ON s.provider_id = sp.id
      INNER JOIN users u ON sp.user_id = u.id
      LEFT JOIN provider_badges pb ON sp.id = pb.provider_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `, queryParams);
    
    // Parse JSON fields - images is already JSONB in database, but handle both cases
    const parsedServices = result.rows.map(service => {
      // Handle images field - ensure it's always an array
      let images = [];
      if (service.images) {
        if (typeof service.images === 'string') {
          try {
            images = JSON.parse(service.images);
          } catch (e) {
            console.warn(`Failed to parse images for service ${service.id}:`, e.message);
            images = [];
          }
        } else if (Array.isArray(service.images)) {
          images = service.images;
        }
      }
      
      return {
        ...service,
        images: images,
        amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
        payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
        contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
      };
    });
    
    res.json({
      success: true,
      data: parsedServices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get services',
      error: error.message
    });
  }
});

// Get service statistics
router.get('/stats', async (req, res) => {
  try {
    // Check if database pool is available
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_services,
        COUNT(*) FILTER (WHERE status = 'active') as active_services,
        COUNT(*) FILTER (WHERE is_featured = true) as featured_services,
        COUNT(*) FILTER (WHERE is_trending = true) as trending_services,
        COUNT(*) FILTER (WHERE status = 'active') as approved_services,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_services,
        COUNT(DISTINCT category) as total_categories
      FROM services
    `);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get service stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service statistics',
      error: error.message
    });
  }
});

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM services
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `);
    
    res.json({
      success: true,
      categories: result.rows
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories',
      error: error.message
    });
  }
});

// Update service featured status
router.patch('/:id/featured', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_featured } = req.body;
    
    // Check if database pool is available
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }
    
    const result = await pool.query(
      'UPDATE services SET is_featured = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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
      message: `Service ${is_featured ? 'added to' : 'removed from'} featured slides`,
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Update featured status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update featured status',
      error: error.message
    });
  }
});

// Update service trending status
router.patch('/:id/trending', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_trending } = req.body;
    
    // Check if database pool is available
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }
    
    const result = await pool.query(
      'UPDATE services SET is_trending = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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
      message: `Service ${is_trending ? 'added to' : 'removed from'} trending services`,
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Update trending status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update trending status',
      error: error.message
    });
  }
});

// Update service promotion categories
router.patch('/:id/promotion', async (req, res) => {
  try {
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
    
    // Check if database pool is available
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection not available'
      });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (search_priority !== undefined) {
      updates.push(`search_priority = $${paramIndex}`);
      values.push(search_priority);
      paramIndex++;
    }
    
    if (category_priority !== undefined) {
      updates.push(`category_priority = $${paramIndex}`);
      values.push(category_priority);
      paramIndex++;
    }
    
    if (is_enhanced_listing !== undefined) {
      updates.push(`is_enhanced_listing = $${paramIndex}`);
      values.push(is_enhanced_listing);
      paramIndex++;
    }
    
    if (has_increased_visibility !== undefined) {
      updates.push(`has_increased_visibility = $${paramIndex}`);
      values.push(has_increased_visibility);
      paramIndex++;
    }
    
    if (carousel_priority !== undefined) {
      updates.push(`carousel_priority = $${paramIndex}`);
      values.push(carousel_priority);
      paramIndex++;
    }
    
    if (has_maximum_visibility !== undefined) {
      updates.push(`has_maximum_visibility = $${paramIndex}`);
      values.push(has_maximum_visibility);
      paramIndex++;
    }
    
    if (promotion_expires_at !== undefined) {
      updates.push(`promotion_expires_at = $${paramIndex}`);
      values.push(promotion_expires_at);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No promotion fields provided to update'
      });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const query = `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Service promotion settings updated successfully',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Update promotion settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update promotion settings',
      error: error.message
    });
  }
});

// Update service status (approve/reject)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, pending, or rejected'
      });
    }
    
    const result = await pool.query(
      'UPDATE services SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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
      service: result.rows[0]
    });
  } catch (error) {
    console.error('Update service status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service status',
      error: error.message
    });
  }
});

// Bulk update featured/trending
router.post('/bulk-update', async (req, res) => {
  try {
    const { service_ids, action, value } = req.body;
    
    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'service_ids array is required'
      });
    }
    
    if (!['featured', 'trending', 'status'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be featured, trending, or status'
      });
    }
    
    let query;
    let params;
    
    if (action === 'featured') {
      query = 'UPDATE services SET is_featured = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2) RETURNING *';
      params = [value, service_ids];
    } else if (action === 'trending') {
      query = 'UPDATE services SET is_trending = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2) RETURNING *';
      params = [value, service_ids];
    } else if (action === 'status') {
      query = 'UPDATE services SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2) RETURNING *';
      params = [value, service_ids];
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      message: `${result.rows.length} services updated successfully`,
      updated_count: result.rows.length
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update services',
      error: error.message
    });
  }
});

// Delete service (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if service exists
    const checkResult = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    // Delete service
    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      error: error.message
    });
  }
});

module.exports = router;
