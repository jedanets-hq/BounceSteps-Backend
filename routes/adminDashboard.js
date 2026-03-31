const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin dashboard');
}

// Dashboard stats endpoint
router.get('/stats', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: {
          users: { total: 0, growth: 0 },
          providers: { total: 0, verified: 0, growth: 0 },
          bookings: { total: 0, completed: 0, growth: 0 },
          services: { total: 0, active: 0, growth: 0 },
          revenue: 0,
          period: req.query.period || '30days'
        },
        message: 'No database connection - Please check database configuration'
      });
    }

    const { period = '30days' } = req.query;
    
    // Calculate date range based on period
    let dateFilter = '';
    let previousDateFilter = '';
    
    if (period === 'today') {
      dateFilter = "AND created_at >= CURRENT_DATE";
      previousDateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE";
    } else if (period === '7days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
      previousDateFilter = "AND created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'";
    } else if (period === '30days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
      previousDateFilter = "AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'";
    } else if (period === '90days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
      previousDateFilter = "AND created_at >= NOW() - INTERVAL '180 days' AND created_at < NOW() - INTERVAL '90 days'";
    } else {
      // All time - no date filter
      dateFilter = '';
      previousDateFilter = '';
    }

    // Get comprehensive stats with growth calculations
    const statsQueries = [
      // Current period stats
      { name: 'users_current', query: `SELECT COUNT(*) as count FROM users WHERE 1=1 ${dateFilter}` },
      { name: 'providers_current', query: `SELECT COUNT(*) as count FROM service_providers WHERE 1=1 ${dateFilter}` },
      { name: 'providers_verified', query: `SELECT COUNT(*) as count FROM service_providers WHERE is_verified = true ${dateFilter}` },
      { name: 'bookings_current', query: `SELECT COUNT(*) as count FROM bookings WHERE 1=1 ${dateFilter}` },
      { name: 'bookings_completed', query: `SELECT COUNT(*) as count FROM bookings WHERE status IN ('completed', 'confirmed') ${dateFilter}` },
      { name: 'services_current', query: `SELECT COUNT(*) as count FROM services WHERE 1=1 ${dateFilter}` },
      { name: 'services_active', query: `SELECT COUNT(*) as count FROM services WHERE status = 'active' ${dateFilter}` },
      { name: 'revenue', query: `SELECT COALESCE(SUM(amount), 0) as total FROM promotion_payments WHERE status = 'completed' ${dateFilter}` }
    ];

    // Previous period stats for growth calculation (only if not all time)
    if (previousDateFilter) {
      statsQueries.push(
        { name: 'users_previous', query: `SELECT COUNT(*) as count FROM users WHERE 1=1 ${previousDateFilter}` },
        { name: 'providers_previous', query: `SELECT COUNT(*) as count FROM service_providers WHERE 1=1 ${previousDateFilter}` },
        { name: 'bookings_previous', query: `SELECT COUNT(*) as count FROM bookings WHERE 1=1 ${previousDateFilter}` }
      );
    }

    const results = {};
    
    for (const { name, query } of statsQueries) {
      try {
        const result = await pool.query(query);
        results[name] = name === 'revenue' 
          ? parseFloat(result.rows[0].total) || 0
          : parseInt(result.rows[0].count) || 0;
      } catch (error) {
        console.warn(`Query failed for ${name}:`, error.message);
        results[name] = 0;
      }
    }

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const stats = {
      users: {
        total: results.users_current || 0,
        growth: previousDateFilter ? calculateGrowth(results.users_current, results.users_previous) : 0
      },
      providers: {
        total: results.providers_current || 0,
        verified: results.providers_verified || 0,
        growth: previousDateFilter ? calculateGrowth(results.providers_current, results.providers_previous) : 0
      },
      bookings: {
        total: results.bookings_current || 0,
        completed: results.bookings_completed || 0,
        growth: previousDateFilter ? calculateGrowth(results.bookings_current, results.bookings_previous) : 0
      },
      services: {
        total: results.services_current || 0,
        active: results.services_active || 0,
        growth: 0 // Services don't have historical comparison yet
      },
      revenue: results.revenue || 0,
      period
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics',
      error: error.message 
    });
  }
});

// Dashboard activity endpoint
router.get('/activity', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        data: [],
        message: 'No database connection - Please check database configuration'
      });
    }

    const { limit = 10 } = req.query;
    const activities = [];

    // Get recent user registrations
    try {
      const usersQuery = `
        SELECT 
          'user_registered' as type,
          CONCAT(first_name, ' ', last_name) as name,
          email,
          user_type,
          created_at
        FROM users 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const usersResult = await pool.query(usersQuery, [Math.floor(limit / 3)]);
      activities.push(...usersResult.rows);
    } catch (error) {
      console.warn('Users activity query failed:', error.message);
    }

    // Get recent bookings
    try {
      const bookingsQuery = `
        SELECT 
          'booking_created' as type,
          CONCAT(u.first_name, ' ', u.last_name) as name,
          u.email,
          'booking' as user_type,
          b.created_at
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        ORDER BY b.created_at DESC 
        LIMIT $1
      `;
      const bookingsResult = await pool.query(bookingsQuery, [Math.floor(limit / 3)]);
      activities.push(...bookingsResult.rows);
    } catch (error) {
      console.warn('Bookings activity query failed:', error.message);
    }

    // Get recent provider registrations
    try {
      const providersQuery = `
        SELECT 
          'provider_registration' as type,
          sp.business_name as name,
          u.email,
          'service_provider' as user_type,
          sp.created_at
        FROM service_providers sp
        JOIN users u ON sp.user_id = u.id
        ORDER BY sp.created_at DESC 
        LIMIT $1
      `;
      const providersResult = await pool.query(providersQuery, [Math.floor(limit / 3)]);
      activities.push(...providersResult.rows);
    } catch (error) {
      console.warn('Providers activity query failed:', error.message);
    }

    // Sort all activities by timestamp and limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, parseInt(limit));

    res.json({ 
      success: true, 
      data: sortedActivities 
    });
  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard activity',
      error: error.message 
    });
  }
});

module.exports = router;