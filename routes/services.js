const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const { authenticateJWT } = require('../middleware/jwtAuth');

// Get all services
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const category = req.query.category; // Get category filter
    const search = req.query.search; // Get search query
    const region = req.query.region; // Get region filter
    const district = req.query.district; // Get district filter
    const area = req.query.area; // Get area/ward filter
    const featured = req.query.featured; // Get featured filter
    const trending = req.query.trending; // Get trending filter
    
    // Build WHERE clause dynamically
    let whereConditions = ["s.status = 'active'", "s.is_active = true", "u.is_active = true"];
    let queryParams = [];
    let paramIndex = 1;
    
    // Add category filter if provided
    if (category && category !== 'all') {
      whereConditions.push(`s.category ILIKE $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }
    
    // Add search filter if provided
    if (search) {
      whereConditions.push(`(s.title ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    // Add featured filter if provided
    if (featured === 'true') {
      whereConditions.push(`s.is_featured = true`);
    }
    
    // Add trending filter if provided
    if (trending === 'true') {
      whereConditions.push(`s.is_trending = true`);
    }
    
    // Location filtering - flexible to show services in requested area
    if (region) {
      whereConditions.push(`s.region ILIKE $${paramIndex}`);
      queryParams.push(region);
      paramIndex++;
    }
    
    if (district) {
      // District can match either district OR area field (frontend ward → backend area)
      // Use ILIKE for case-insensitive matching
      whereConditions.push(`(s.district ILIKE $${paramIndex} OR s.area ILIKE $${paramIndex})`);
      queryParams.push(district);
      paramIndex++;
    }
    
    if (area) {
      // Area/ward matching - use ILIKE for case-insensitive partial matches
      // This allows "BUZURUGA" to match "BUZURUGA KASKAZINI", "Buzuruga", etc.
      whereConditions.push(`s.area ILIKE $${paramIndex}`);
      queryParams.push(`%${area}%`); // Add % for partial matching on both sides
      paramIndex++;
    }
    
    // Add limit parameter
    queryParams.push(limit);
    
    const whereClause = whereConditions.join(' AND ');
    
    // Query services table with provider information INCLUDING avatar_url
    const result = await pool.query(`
      SELECT s.*, 
             sp.id as service_provider_id,
             sp.user_id as provider_user_id,
             sp.business_name, 
             sp.location as provider_location,
             sp.rating as provider_rating,
             sp.is_verified as provider_verified,
             sp.region as provider_region,
             sp.district as provider_district,
             sp.area as provider_area,
             sp.service_categories as provider_service_categories,
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
      WHERE ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex}
    `, queryParams);
    
    console.log(`📦 Services query: region=${region || 'any'}, district=${district || 'any'}, area=${area || 'any'}, category=${category || 'all'}, search=${search || 'none'}, featured=${featured || 'any'}, trending=${trending || 'any'}, found=${result.rows.length}`);
    console.log(`✅ FLEXIBLE FILTERING - Providers can offer ANY service category`);
    
    // Parse JSON fields that are stored as TEXT
    const parsedServices = result.rows.map(service => ({
      ...service,
      images: service.images ? (typeof service.images === 'string' ? JSON.parse(service.images) : service.images) : [],
      amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
      payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
      contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
    }));
    
    res.json({ 
      success: true, 
      services: parsedServices,
      count: parsedServices.length
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Failed to get services' });
  }
});

// Get featured/trending services for homepage - MUST BE BEFORE /:id route
router.get('/featured/slides', async (req, res) => {
  try {
    // Check if services table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'services'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      // Use services table if it exists - get featured services
      const result = await pool.query(`
        SELECT s.*, 
               sp.business_name, 
               sp.location as provider_location,
               u.first_name as provider_first_name,
               u.last_name as provider_last_name,
               u.avatar_url
        FROM services s
        LEFT JOIN service_providers sp ON s.provider_id = sp.id
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE s.status = 'active' AND s.is_featured = true AND s.is_active = true AND u.is_active = true
        ORDER BY s.created_at DESC
        LIMIT 6
      `);
      
      // Parse JSON fields
      const parsedServices = result.rows.map(service => ({
        ...service,
        images: service.images ? (typeof service.images === 'string' ? JSON.parse(service.images) : service.images) : [],
        amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
        payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
        contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
      }));
      
      res.json({
        success: true,
        services: parsedServices,
        count: parsedServices.length
      });
    } else {
      // Fallback to service_providers table
      const result = await pool.query(`
        SELECT sp.*, u.email, u.first_name, u.last_name, u.avatar_url
        FROM service_providers sp
        JOIN users u ON sp.user_id = u.id
        WHERE u.is_active = true
        ORDER BY sp.created_at DESC
        LIMIT 6
      `);
      
      res.json({
        success: true,
        services: result.rows,
        count: result.rows.length
      });
    }
  } catch (error) {
    console.error('Get featured services error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get featured services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get trending services for homepage - MUST BE BEFORE /:id route
router.get('/trending', async (req, res) => {
  try {
    const limit = req.query.limit || 12;
    
    const result = await pool.query(`
      SELECT s.*, 
             sp.id as service_provider_id,
             sp.user_id as provider_user_id,
             sp.business_name, 
             sp.location as provider_location,
             sp.rating as provider_rating,
             sp.is_verified as provider_verified,
             sp.region as provider_region,
             sp.district as provider_district,
             sp.area as provider_area,
             sp.service_categories as provider_service_categories,
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
      WHERE s.status = 'active' AND s.is_trending = true AND s.is_active = true AND u.is_active = true
      ORDER BY s.created_at DESC
      LIMIT $1
    `, [limit]);
    
    // Parse JSON fields
    const parsedServices = result.rows.map(service => ({
      ...service,
      images: service.images ? (typeof service.images === 'string' ? JSON.parse(service.images) : service.images) : [],
      amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
      payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
      contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
    }));
    
    res.json({
      success: true,
      services: parsedServices,
      count: parsedServices.length
    });
  } catch (error) {
    console.error('Get trending services error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get trending services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
             sp.id as service_provider_id,
             sp.user_id as provider_user_id,
             sp.business_name, 
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
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      LEFT JOIN users u ON sp.user_id = u.id
      LEFT JOIN provider_badges pb ON sp.id = pb.provider_id
      WHERE s.id = $1 AND s.is_active = true AND u.is_active = true
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    // Parse JSON fields
    const service = result.rows[0];
    const parsedService = {
      ...service,
      images: service.images ? (typeof service.images === 'string' ? JSON.parse(service.images) : service.images) : [],
      amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
      payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
      contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
    };
    
    res.json({ success: true, service: parsedService });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ success: false, message: 'Failed to get service' });
  }
});

// Get provider's own services
router.get('/provider/my-services', authenticateJWT, async (req, res) => {
  try {
    console.log('📋 Fetching services for user:', req.user.id);
    
    // FIXED: Get service_providers.id first, then query services
    const providerResult = await pool.query(
      'SELECT id FROM service_providers WHERE user_id = $1',
      [req.user.id]
    );
    
    if (providerResult.rows.length === 0) {
      console.log('⚠️ No provider profile found for user:', req.user.id);
      return res.json({
        success: true,
        services: []
      });
    }
    
    const providerId = providerResult.rows[0].id;
    console.log('✅ Provider ID:', providerId);
    
    const result = await pool.query(`
      SELECT s.*, 
             COALESCE(COUNT(DISTINCT b.id), 0) as total_bookings
      FROM services s
      LEFT JOIN bookings b ON b.service_id = s.id
      WHERE s.provider_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `, [providerId]);
    
    console.log(`✅ Found ${result.rows.length} services for user ${req.user.id}`);
    
    // Parse JSON fields
    const parsedServices = result.rows.map(service => ({
      ...service,
      images: service.images ? (typeof service.images === 'string' ? JSON.parse(service.images) : service.images) : [],
      amenities: service.amenities ? (typeof service.amenities === 'string' ? JSON.parse(service.amenities) : service.amenities) : [],
      payment_methods: service.payment_methods ? (typeof service.payment_methods === 'string' ? JSON.parse(service.payment_methods) : service.payment_methods) : {},
      contact_info: service.contact_info ? (typeof service.contact_info === 'string' ? JSON.parse(service.contact_info) : service.contact_info) : {}
    }));
    
    res.json({
      success: true,
      services: parsedServices
    });
  } catch (error) {
    console.error('❌ Error fetching provider services:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new service - INHERIT location from provider profile
router.post('/', authenticateJWT, async (req, res) => {
  try {
    console.log('📝 Creating new service for user:', req.user.id);
    console.log('📦 Service data:', req.body);
    
    const {
      title,
      description,
      category,
      price,
      duration,
      maxParticipants,
      images,
      amenities,
      paymentMethods,
      contactInfo
    } = req.body;
    
    // Validate required fields
    if (!title || !price) {
      return res.status(400).json({
        success: false,
        message: 'Title and price are required'
      });
    }
    
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }
    
    // Validate contact info - at least one method required
    if (!contactInfo || (!contactInfo.email?.enabled && !contactInfo.whatsapp?.enabled)) {
      return res.status(400).json({
        success: false,
        message: 'At least one contact method (email or WhatsApp) is required'
      });
    }
    
    // GET PROVIDER PROFILE - Get service_providers.id AND location
    const providerResult = await pool.query(`
      SELECT id, region, district, area, ward, country, location, service_location
      FROM service_providers
      WHERE user_id = $1
    `, [req.user.id]);
    
    if (providerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provider profile not found. Please complete your profile first.'
      });
    }
    
    const provider = providerResult.rows[0];
    console.log('✅ Using service_providers.id:', provider.id);
    
    // Insert service into database with CORRECT provider_id (service_providers.id)
    const result = await pool.query(`
      INSERT INTO services (
        provider_id,
        title,
        description,
        category,
        price,
        duration,
        max_participants,
        location,
        region,
        district,
        area,
        country,
        images,
        amenities,
        payment_methods,
        contact_info,
        status,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      provider.id,  // FIXED: Use service_providers.id instead of user_id
      title,
      description || '',
      category,
      price,
      duration || null,
      maxParticipants || null,
      provider.service_location || provider.location || 'Tanzania',
      provider.region || '',
      provider.district || '',
      provider.area || provider.ward || '',
      provider.country || 'Tanzania',
      JSON.stringify(images || []),
      JSON.stringify(amenities || []),
      JSON.stringify(paymentMethods || {}),
      JSON.stringify(contactInfo || {}),
      'active',
      true
    ]);
    
    console.log('✅ Service created successfully with provider location:', result.rows[0].id);
    console.log(`   Region: ${provider.region}, District: ${provider.district}, Area: ${provider.area}`);
    
    res.json({
      success: true,
      message: 'Service created successfully',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating service:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update service status (activate/pause)
router.patch('/:id/status', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    console.log(`🔄 Updating service ${id} status to:`, is_active);
    
    // Get service_providers.id for the current user
    const providerResult = await pool.query(
      'SELECT id FROM service_providers WHERE user_id = $1',
      [req.user.id]
    );
    
    if (providerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found'
      });
    }
    
    const providerId = providerResult.rows[0].id;
    
    // Verify service belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM services WHERE id = $1 AND provider_id = $2',
      [id, providerId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to modify it'
      });
    }
    
    // Update status
    const result = await pool.query(
      'UPDATE services SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND provider_id = $3 RETURNING *',
      [is_active, id, providerId]
    );
    
    console.log('✅ Service status updated successfully');
    
    res.json({
      success: true,
      message: `Service ${is_active ? 'activated' : 'paused'} successfully`,
      service: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating service status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update service status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update service - location cannot be changed (inherited from provider)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 Updating service ${id} for user:`, req.user.id);
    
    const {
      title,
      description,
      category,
      price,
      duration,
      maxParticipants,
      images,
      amenities,
      paymentMethods,
      contactInfo
    } = req.body;
    
    // Get service_providers.id for the current user
    const providerResult = await pool.query(
      'SELECT id FROM service_providers WHERE user_id = $1',
      [req.user.id]
    );
    
    if (providerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found'
      });
    }
    
    const providerId = providerResult.rows[0].id;
    
    // Verify service belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM services WHERE id = $1 AND provider_id = $2',
      [id, providerId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to modify it'
      });
    }
    
    // Update service - NOTE: location fields are NOT updated (they come from provider profile)
    const result = await pool.query(`
      UPDATE services SET
        title = $1,
        description = $2,
        category = $3,
        price = $4,
        duration = $5,
        max_participants = $6,
        images = $7,
        amenities = $8,
        payment_methods = $9,
        contact_info = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND provider_id = $12
      RETURNING *
    `, [
      title,
      description || '',
      category,
      price,
      duration || null,
      maxParticipants || null,
      JSON.stringify(images || []),
      JSON.stringify(amenities || []),
      JSON.stringify(paymentMethods || {}),
      JSON.stringify(contactInfo || {}),
      id,
      providerId
    ]);
    
    console.log('✅ Service updated successfully (location inherited from provider profile)');
    
    res.json({
      success: true,
      message: 'Service updated successfully',
      service: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating service:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete service
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting service ${id} for user:`, req.user.id);
    
    // Get service_providers.id for the current user
    const providerResult = await pool.query(
      'SELECT id FROM service_providers WHERE user_id = $1',
      [req.user.id]
    );
    
    if (providerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found'
      });
    }
    
    const providerId = providerResult.rows[0].id;
    
    // Verify service belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM services WHERE id = $1 AND provider_id = $2',
      [id, providerId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to delete it'
      });
    }
    
    // Delete service
    await pool.query(
      'DELETE FROM services WHERE id = $1 AND provider_id = $2',
      [id, providerId]
    );
    
    console.log('✅ Service deleted successfully');
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting service:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
