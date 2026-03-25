const express = require('express');
const router = express.Router();
const { pool } = require('../config/postgresql');

// Dashboard stats endpoint
router.get('/stats', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    // Calculate date range based on period
    let dateFilter = '';
    if (period === '7days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === '30days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === '90days') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
    }

    // Get basic stats with error handling for missing tables
    const queries = [
      { name: 'users', query: `SELECT COUNT(*) as count FROM users WHERE 1=1 ${dateFilter}` },
      { name: 'providers', query: `SELECT COUNT(*) as count FROM service_providers WHERE 1=1 ${dateFilter}` },
      { name: 'bookings', query: `SELECT COUNT(*) as count FROM bookings WHERE 1=1 ${dateFilter}` },
      { name: 'services', query: `SELECT COUNT(*) as count FROM services WHERE 1=1 ${dateFilter}` },
      { name: 'revenue', query: `SELECT COALESCE(SUM(amount), 0) as total FROM promotion_payments WHERE status = 'completed' ${dateFilter}` }
    ];

    const results = {};
    
    for (const { name, query } of queries) {
      try {
        const result = await pool.query(query);
        results[name] = name === 'revenue' 
          ? parseFloat(result.rows[0].total) || 0
          : parseInt(result.rows[0].count) || 0;
      } catch (error) {
        console.warn(`Table might not exist for ${name}:`, error.message);
        results[name] = 0;
      }
    }

    // Get growth data for the period
    let growthData = {};
    try {
      const growthQuery = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as new_users
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '${period === '7days' ? '7' : period === '30days' ? '30' : '90'} days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
        LIMIT 10
      `;
      const growthResult = await pool.query(growthQuery);
      growthData = {
        userGrowth: growthResult.rows
      };
    } catch (error) {
      console.warn('Growth data query failed:', error.message);
      growthData = { userGrowth: [] };
    }

    const stats = {
      users: results.users,
      providers: results.providers,
      bookings: results.bookings,
      services: results.services,
      revenue: results.revenue,
      period,
      growth: growthData
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
    const { limit = 10 } = req.query;

    const activities = [];

    // Get recent user registrations
    try {
      const usersQuery = `
        SELECT 
          'user_registration' as type,
          first_name || ' ' || last_name as description,
          email,
          created_at as timestamp
        FROM users 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const usersResult = await pool.query(usersQuery, [Math.floor(limit / 2)]);
      activities.push(...usersResult.rows.map(row => ({
        ...row,
        description: `New user registered: ${row.description}`,
        details: { email: row.email }
      })));
    } catch (error) {
      console.warn('Users activity query failed:', error.message);
    }

    // Get recent bookings
    try {
      const bookingsQuery = `
        SELECT 
          'booking_created' as type,
          'New booking for ' || service_type as description,
          booking_date,
          created_at as timestamp,
          total_amount
        FROM bookings 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const bookingsResult = await pool.query(bookingsQuery, [Math.floor(limit / 2)]);
      activities.push(...bookingsResult.rows.map(row => ({
        ...row,
        details: { 
          booking_date: row.booking_date,
          amount: row.total_amount 
        }
      })));
    } catch (error) {
      console.warn('Bookings activity query failed:', error.message);
    }

    // Get recent provider registrations
    try {
      const providersQuery = `
        SELECT 
          'provider_registration' as type,
          'New provider: ' || business_name as description,
          business_type,
          created_at as timestamp
        FROM service_providers 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const providersResult = await pool.query(providersQuery, [Math.floor(limit / 3)]);
      activities.push(...providersResult.rows.map(row => ({
        ...row,
        details: { business_type: row.business_type }
      })));
    } catch (error) {
      console.warn('Providers activity query failed:', error.message);
    }

    // Sort all activities by timestamp and limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
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