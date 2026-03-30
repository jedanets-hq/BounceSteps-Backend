const express = require('express');
const router = express.Router();
const { pool } = require('../models');
const passport = require('passport');

// Public endpoint - Get recent booking activity (for homepage)
router.get('/public/recent-activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await pool.query(`
      SELECT 
        b.id,
        b.created_at,
        b.service_type,
        b.participants,
        s.title as service_title,
        s.location as service_location,
        s.category as service_category,
        u.first_name,
        u.last_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.status IN ('confirmed', 'completed')
      ORDER BY b.created_at DESC
      LIMIT $1
    `, [limit]);
    
    // Anonymize user data for privacy
    const activities = result.rows.map(activity => ({
      id: activity.id,
      created_at: activity.created_at,
      service_type: activity.service_type,
      service_title: activity.service_title,
      service_location: activity.service_location,
      service_category: activity.service_category,
      participants: activity.participants,
      traveler_name: activity.first_name ? `${activity.first_name} ${activity.last_name?.charAt(0)}.` : 'Anonymous'
    }));
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to get recent activity' });
  }
});

// Get all bookings for authenticated user
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        s.title as service_title,
        s.description as service_description,
        s.images as service_images,
        s.location as service_location,
        s.price as service_price,
        s.category as service_category,
        sp.business_name,
        sp.business_phone as provider_phone,
        sp.business_email as provider_email,
        sp.user_id as provider_user_id,
        u.first_name as traveler_first_name,
        u.last_name as traveler_last_name,
        u.email as traveler_email,
        u.phone as traveler_phone
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);
    
    // Ensure total_price is set from total_amount if not present
    const bookings = result.rows.map(booking => ({
      ...booking,
      total_price: booking.total_price || booking.total_amount
    }));
    
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get bookings' });
  }
});

// Get provider analytics (MUST be before /provider route to avoid route collision)
router.get('/provider-analytics', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30days' } = req.query;
    
    console.log('📊 Fetching provider analytics:', { userId, timeRange });
    
    // Get provider_id from service_providers table
    const providerResult = await pool.query(`
      SELECT id FROM service_providers WHERE user_id = $1
    `, [userId]);
    
    if (providerResult.rows.length === 0) {
      return res.json({ 
        success: true, 
        analytics: {
          revenue: { total: 0, growth: 0, trend: 'neutral' },
          bookings: { total: 0, growth: 0, trend: 'neutral' },
          customers: { total: 0, growth: 0, trend: 'neutral' },
          rating: { average: 0, total: 0, growth: 0, trend: 'neutral' }
        },
        topServices: [],
        monthlyData: [],
        topCountries: []
      });
    }
    
    const providerId = providerResult.rows[0].id;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let previousStartDate = new Date();
    
    switch (timeRange) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        previousStartDate.setDate(now.getDate() - 14);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        previousStartDate.setDate(now.getDate() - 60);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        previousStartDate.setDate(now.getDate() - 180);
        break;
      case '1year':
        startDate.setFullYear(now.getFullYear() - 1);
        previousStartDate.setFullYear(now.getFullYear() - 2);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
        previousStartDate.setDate(now.getDate() - 60);
    }
    
    // Get current period bookings
    const currentBookings = await pool.query(`
      SELECT 
        b.*,
        u.first_name,
        u.last_name,
        s.title as service_title,
        s.category as service_category
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.provider_id = $1 
        AND b.created_at >= $2
        AND b.status != 'cancelled'
      ORDER BY b.created_at DESC
    `, [providerId, startDate]);
    
    // Get previous period bookings for comparison
    const previousBookings = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM bookings
      WHERE provider_id = $1 
        AND created_at >= $2 
        AND created_at < $3
        AND status != 'cancelled'
    `, [providerId, previousStartDate, startDate]);
    
    // Calculate metrics
    const totalRevenue = currentBookings.rows.reduce((sum, b) => sum + parseFloat(b.total_amount || 0), 0);
    const totalBookings = currentBookings.rows.length;
    const uniqueCustomers = new Set(currentBookings.rows.map(b => b.user_id)).size;
    
    // Calculate growth percentages
    const previousRevenue = parseFloat(previousBookings.rows[0]?.revenue || 0);
    const previousBookingCount = parseInt(previousBookings.rows[0]?.count || 0);
    
    const revenueGrowth = previousRevenue > 0 
      ? Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 100)
      : 0;
    const bookingsGrowth = previousBookingCount > 0
      ? Math.round(((totalBookings - previousBookingCount) / previousBookingCount) * 100)
      : 0;
    
    // Get top services
    const serviceStats = {};
    currentBookings.rows.forEach(booking => {
      const serviceId = booking.service_id;
      const serviceName = booking.service_title || 'Unknown Service';
      
      if (!serviceStats[serviceId]) {
        serviceStats[serviceId] = {
          name: serviceName,
          bookings: 0,
          revenue: 0,
          rating: null
        };
      }
      
      serviceStats[serviceId].bookings += 1;
      serviceStats[serviceId].revenue += parseFloat(booking.total_amount || 0);
    });
    
    const topServices = Object.values(serviceStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(s => ({
        ...s,
        revenue: Math.round(s.revenue * 100) / 100
      }));
    
    // Get monthly data
    const monthlyStats = {};
    currentBookings.rows.forEach(booking => {
      const date = new Date(booking.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          month: monthName,
          revenue: 0,
          bookings: 0
        };
      }
      
      monthlyStats[monthKey].revenue += parseFloat(booking.total_amount || 0);
      monthlyStats[monthKey].bookings += 1;
    });
    
    const monthlyData = Object.values(monthlyStats)
      .map(m => ({
        ...m,
        revenue: Math.round(m.revenue * 100) / 100
      }))
      .slice(-6); // Last 6 months
    
    // Get top countries (using service location as proxy since users don't have country)
    const countryStats = {};
    currentBookings.rows.forEach(booking => {
      // Extract country from service location if available
      const location = booking.service_location || 'Unknown';
      const country = location.split(',').pop().trim() || 'Unknown';
      countryStats[country] = (countryStats[country] || 0) + 1;
    });
    
    const topCountries = Object.entries(countryStats)
      .map(([country, count]) => ({
        country,
        count,
        percentage: Math.round((count / totalBookings) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Prepare response
    const analytics = {
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        growth: revenueGrowth,
        trend: revenueGrowth > 0 ? 'up' : revenueGrowth < 0 ? 'down' : 'neutral'
      },
      bookings: {
        total: totalBookings,
        growth: bookingsGrowth,
        trend: bookingsGrowth > 0 ? 'up' : bookingsGrowth < 0 ? 'down' : 'neutral'
      },
      customers: {
        total: uniqueCustomers,
        growth: 0,
        trend: 'neutral'
      },
      rating: {
        average: 0,
        total: 0,
        growth: 0,
        trend: 'neutral'
      }
    };
    
    console.log('✅ Analytics calculated:', {
      revenue: analytics.revenue.total,
      bookings: analytics.bookings.total,
      customers: analytics.customers.total
    });
    
    res.json({
      success: true,
      analytics,
      topServices,
      monthlyData,
      topCountries
    });
  } catch (error) {
    console.error('❌ Get provider analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all bookings for a service provider
router.get('/provider', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get provider_id from service_providers table
    const providerCheck = await pool.query(`
      SELECT user_id FROM service_providers WHERE user_id = $1
    `, [userId]);
    
    if (providerCheck.rows.length === 0) {
      return res.json({ success: true, bookings: [] });
    }
    
    const result = await pool.query(`
      SELECT 
        b.*,
        s.title as service_title,
        s.description as service_description,
        s.images as service_images,
        s.location as service_location,
        s.price as service_price,
        s.category as service_category,
        sp.business_name,
        sp.business_phone as provider_phone,
        sp.business_email as provider_email,
        u.first_name as traveler_first_name,
        u.last_name as traveler_last_name,
        u.email as traveler_email,
        u.phone as traveler_phone
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.provider_id = (SELECT id FROM service_providers WHERE user_id = $1)
      ORDER BY 
        CASE 
          WHEN b.status = 'pending' THEN 1
          WHEN b.status = 'confirmed' THEN 2
          WHEN b.status = 'completed' THEN 3
          ELSE 4
        END,
        b.created_at DESC
    `, [userId]);
    
    // Ensure total_price is set
    const bookings = result.rows.map(booking => ({
      ...booking,
      total_price: booking.total_price || booking.total_amount
    }));
    
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get provider bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get bookings' });
  }
});

// Create booking (Pre-order)
router.post('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.id;
    const { serviceId, bookingDate, participants = 1, specialRequests } = req.body;
    
    console.log('📝 Creating booking/pre-order:', { userId, serviceId, bookingDate, participants });
    
    if (!serviceId || !bookingDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Service ID and booking date are required' 
      });
    }
    
    await client.query('BEGIN');
    
    // Get service details with provider info
    // FIXED: services.provider_id stores service_providers.id, not user_id
    const serviceResult = await client.query(`
      SELECT 
        s.*,
        sp.id as sp_id,
        sp.user_id as provider_user_id,
        sp.business_name,
        sp.business_phone as provider_phone,
        sp.business_email as provider_email,
        u.first_name as traveler_first_name,
        u.last_name as traveler_last_name
      FROM services s
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      LEFT JOIN users u ON u.id = $2
      WHERE s.id = $1
    `, [serviceId, userId]);
    
    if (serviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    const service = serviceResult.rows[0];
    
    // Handle missing provider - create booking anyway with NULL provider_id
    let providerId = service.sp_id;
    let businessName = service.business_name || 'Unknown Provider';
    let providerPhone = service.provider_phone || '';
    let providerEmail = service.provider_email || '';
    
    if (!service.sp_id) {
      console.warn('⚠️  Service has no provider in service_providers table:', {
        serviceId,
        serviceProviderId: service.provider_id
      });
      // Set provider_id to NULL - booking will still be created
      providerId = null;
      businessName = 'Provider Not Available';
    }
    
    const totalAmount = parseFloat(service.price) * parseInt(participants);
    
    // Parse images if it's a string
    let serviceImages = service.images;
    if (typeof serviceImages === 'string') {
      try {
        serviceImages = JSON.parse(serviceImages);
      } catch (e) {
        serviceImages = [];
      }
    }
    
    // Create booking with all necessary data
    // Use sp_id which is the actual service_providers.id, not user_id
    const result = await client.query(`
      INSERT INTO bookings (
        user_id, 
        service_id,
        provider_id, 
        service_type, 
        booking_date,
        travel_date,
        participants,
        total_amount,
        total_price,
        booking_details,
        special_requests,
        service_title,
        service_description,
        service_images,
        service_location,
        business_name,
        provider_phone,
        provider_email,
        traveler_first_name,
        traveler_last_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `, [
      userId,
      serviceId,
      service.sp_id, // Use sp_id (service_providers.id) not provider_id (user_id)
      service.category || 'General',
      bookingDate,
      bookingDate, // travel_date same as booking_date
      participants,
      totalAmount,
      totalAmount, // total_price same as total_amount
      JSON.stringify({
        service_title: service.title,
        service_category: service.category,
        participants: participants,
        booking_date: bookingDate
      }),
      specialRequests || null,
      service.title,
      service.description || '',
      JSON.stringify(serviceImages),
      service.location || '',
      service.business_name || 'Unknown Provider',
      service.provider_phone || '',
      service.provider_email || '',
      service.traveler_first_name || '',
      service.traveler_last_name || '',
      'pending'
    ]);
    
    await client.query('COMMIT');
    
    console.log('✅ Booking created successfully:', result.rows[0].id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Pre-order created successfully',
      booking: result.rows[0] 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Create booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// Update booking status (for providers)
router.patch('/:id/status', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { status } = req.body;
    const bookingId = req.params.id;
    const userId = req.user.id;
    
    console.log('📝 Updating booking status:', { bookingId, status, userId });
    console.log('📝 Request body:', req.body);
    console.log('📝 Request params:', req.params);
    console.log('📝 User from JWT:', req.user);
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    // Get provider_id from service_providers table
    const providerResult = await pool.query(`
      SELECT id FROM service_providers WHERE user_id = $1
    `, [userId]);
    
    if (providerResult.rows.length === 0) {
      console.log('❌ User is not a service provider:', userId);
      return res.status(403).json({ 
        success: false, 
        message: 'You are not registered as a service provider' 
      });
    }
    
    const providerId = providerResult.rows[0].id;
    console.log('✅ Provider ID:', providerId);
    
    // Verify the booking belongs to this provider
    const checkResult = await pool.query(`
      SELECT b.id, b.provider_id, b.status as current_status
      FROM bookings b
      WHERE b.id = $1 AND b.provider_id = $2
    `, [bookingId, providerId]);
    
    if (checkResult.rows.length === 0) {
      console.log('❌ Booking not found or not owned by provider:', { bookingId, providerId });
      
      // Additional debugging - check if booking exists at all
      const bookingCheck = await pool.query(`
        SELECT id, provider_id, status FROM bookings WHERE id = $1
      `, [bookingId]);
      
      if (bookingCheck.rows.length > 0) {
        console.log('❌ Booking exists but provider_id mismatch:');
        console.log('   Booking provider_id:', bookingCheck.rows[0].provider_id);
        console.log('   User provider_id:', providerId);
      } else {
        console.log('❌ Booking does not exist:', bookingId);
      }
      
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found or you do not have permission to update it' 
      });
    }
    
    console.log('✅ Booking verified, current status:', checkResult.rows[0].current_status);
    
    // Update the booking status
    const result = await pool.query(`
      UPDATE bookings 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, bookingId]);
    
    console.log('✅ Booking status updated to:', status);
    
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('❌ Update booking error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete booking (for both travelers and providers)
router.delete('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;
    
    console.log('🗑️ Deleting booking:', { bookingId, userId });
    console.log('🗑️ User from JWT:', req.user);
    
    // Get provider_id if user is a provider
    const providerResult = await pool.query(`
      SELECT id FROM service_providers WHERE user_id = $1
    `, [userId]);
    
    const providerId = providerResult.rows.length > 0 ? providerResult.rows[0].id : null;
    console.log('🗑️ Provider ID:', providerId);
    
    // Delete booking if user is either the traveler or the provider
    const result = await pool.query(`
      DELETE FROM bookings
      WHERE id = $1 AND (user_id = $2 OR provider_id = $3)
      RETURNING *
    `, [bookingId, userId, providerId]);
    
    if (result.rows.length === 0) {
      console.log('❌ Booking not found or permission denied');
      
      // Check if booking exists
      const bookingCheck = await pool.query(`
        SELECT id, user_id, provider_id FROM bookings WHERE id = $1
      `, [bookingId]);
      
      if (bookingCheck.rows.length > 0) {
        console.log('❌ Booking exists but permission denied:');
        console.log('   Booking user_id:', bookingCheck.rows[0].user_id);
        console.log('   Booking provider_id:', bookingCheck.rows[0].provider_id);
        console.log('   Current user_id:', userId);
        console.log('   Current provider_id:', providerId);
      } else {
        console.log('❌ Booking does not exist:', bookingId);
      }
      
      return res.status(404).json({ 
        success: false, 
        message: 'Booking not found or you do not have permission to delete it' 
      });
    }
    
    console.log('✅ Booking deleted successfully');
    
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('❌ Delete booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete booking' });
  }
});

module.exports = router;
