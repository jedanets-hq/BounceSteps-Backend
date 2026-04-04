const express = require('express');
const router = express.Router();

// Database connection with error handling
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin dashboard');
}

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const { period = '30days' } = req.query;

    if (!pool) {
      // Return demo data with realistic numbers based on period
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          break;
        case 'alltime':
          startDate = new Date('2020-01-01');
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }
      
      // Simulate realistic data based on period
      const daysDiff = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
      const baseUsers = Math.floor(daysDiff * 2.5); // ~2.5 users per day
      const baseProviders = Math.floor(daysDiff * 0.3); // ~0.3 providers per day
      const baseBookings = Math.floor(daysDiff * 1.2); // ~1.2 bookings per day
      
      return res.json({
        success: true,
        data: {
          users: {
            total: baseUsers + Math.floor(Math.random() * 50),
            growth: Math.floor(Math.random() * 20) - 5 // -5% to +15%
          },
          providers: {
            total: baseProviders + Math.floor(Math.random() * 10),
            verified: Math.floor((baseProviders + Math.floor(Math.random() * 10)) * 0.8),
            growth: Math.floor(Math.random() * 15) - 2 // -2% to +13%
          },
          bookings: {
            total: baseBookings + Math.floor(Math.random() * 30),
            completed: Math.floor((baseBookings + Math.floor(Math.random() * 30)) * 0.85),
            growth: Math.floor(Math.random() * 25) - 5 // -5% to +20%
          },
          services: {
            total: 156 + Math.floor(Math.random() * 20),
            active: 142 + Math.floor(Math.random() * 15),
            growth: Math.floor(Math.random() * 10) - 2 // -2% to +8%
          },
          revenue: (baseBookings * 450) + Math.floor(Math.random() * 10000),
          period: period,
          dateRange: {
            start: startDate.toISOString(),
            end: now.toISOString()
          },
          message: `Demo data filtered for ${period} (${daysDiff} days)`
        }
      });
    }

    // Calculate date ranges
    let currentStartDate, previousStartDate, previousEndDate;
    
    if (period === 'today') {
      // Today: from start of today
      currentStartDate = new Date();
      currentStartDate.setHours(0, 0, 0, 0);
      
      // Previous period: yesterday
      previousStartDate = new Date();
      previousStartDate.setDate(previousStartDate.getDate() - 2);
      previousStartDate.setHours(0, 0, 0, 0);
      
      previousEndDate = new Date();
      previousEndDate.setDate(previousEndDate.getDate() - 1);
      previousEndDate.setHours(0, 0, 0, 0);
      
    } else if (period === 'alltime') {
      // All time: from beginning of time (1970)
      currentStartDate = new Date('1970-01-01');
      
      // For all time, we compare with data from 1 year ago to now
      previousStartDate = new Date();
      previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
      
      previousEndDate = new Date();
      previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);
      
    } else {
      // Standard period (7days, 30days, 90days)
      const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
      const days = daysMap[period] || 30;
      
      currentStartDate = new Date();
      currentStartDate.setDate(currentStartDate.getDate() - days);
      
      previousStartDate = new Date();
      previousStartDate.setDate(previousStartDate.getDate() - (days * 2));
      
      previousEndDate = new Date();
      previousEndDate.setDate(previousEndDate.getDate() - days);
    }

    // Total users
    const usersResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= $1) as current_period,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3) as previous_period
      FROM users
    `, [currentStartDate, previousStartDate, previousEndDate]);

    // Total providers
    const providersResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= $1) as current_period,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3) as previous_period,
        COUNT(*) FILTER (WHERE is_verified = true) as verified
      FROM service_providers
    `, [currentStartDate, previousStartDate, previousEndDate]);

    // Total bookings
    const bookingsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= $1) as current_period,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3) as previous_period,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM bookings
    `, [currentStartDate, previousStartDate, previousEndDate]);

    // Total revenue
    const revenueResult = await pool.query(`
      SELECT 
        COALESCE(SUM(total_price), 0) as total,
        COALESCE(SUM(total_price) FILTER (WHERE created_at >= $1), 0) as current_period,
        COALESCE(SUM(total_price) FILTER (WHERE created_at >= $2 AND created_at < $3), 0) as previous_period
      FROM bookings
      WHERE status IN ('confirmed', 'completed')
    `, [currentStartDate, previousStartDate, previousEndDate]);

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const users = usersResult.rows[0];
    const providers = providersResult.rows[0];
    const bookings = bookingsResult.rows[0];
    const revenue = revenueResult.rows[0];

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(users.total),
          growth: calculateGrowth(parseInt(users.current_period), parseInt(users.previous_period))
        },
        providers: {
          total: parseInt(providers.total),
          verified: parseInt(providers.verified),
          growth: calculateGrowth(parseInt(providers.current_period), parseInt(providers.previous_period))
        },
        bookings: {
          total: parseInt(bookings.total),
          completed: parseInt(bookings.completed),
          growth: calculateGrowth(parseInt(bookings.current_period), parseInt(bookings.previous_period))
        },
        services: {
          total: 156, // Static for now
          active: 142, // Static for now
          growth: 5 // Static for now
        },
        revenue: parseFloat(revenue.total)
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard statistics',
      error: error.message
    });
  }
});

// Get recent activity
router.get('/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    if (!pool) {
      return res.json({
        success: true,
        data: [
          {
            type: 'user_registration',
            name: 'John Doe',
            email: 'john.doe@example.com',
            user_type: 'traveler',
            created_at: '2026-03-25T10:30:00Z'
          },
          {
            type: 'booking_created',
            name: 'Jane Smith',
            email: 'Safari Tour Booking',
            user_type: 'confirmed',
            created_at: '2026-03-25T09:15:00Z'
          },
          {
            type: 'service_created',
            name: 'Safari Adventures Ltd',
            email: 'Kilimanjaro Trek',
            user_type: 'Adventure Sports',
            created_at: '2026-03-25T08:45:00Z'
          }
        ].slice(0, parseInt(limit)),
        message: 'Demo data - Connect database for live activity'
      });
    }

    const result = await pool.query(`
      SELECT 
        'user_registered' as type,
        u.id,
        u.first_name || ' ' || u.last_name as name,
        u.email,
        u.user_type,
        u.created_at
      FROM users u
      WHERE u.created_at >= NOW() - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'booking_created' as type,
        b.id,
        u.first_name || ' ' || u.last_name as name,
        COALESCE(b.service_title, 'Unknown Service') as email,
        b.status as user_type,
        b.created_at
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.created_at >= NOW() - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'service_created' as type,
        s.id,
        COALESCE(sp.business_name, 'Unknown Provider') as name,
        s.title as email,
        s.category as user_type,
        s.created_at
      FROM services s
      LEFT JOIN users u ON s.provider_id = u.id
      LEFT JOIN service_providers sp ON u.id = sp.user_id
      WHERE s.created_at >= NOW() - INTERVAL '7 days'
      
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity',
      error: error.message
    });
  }
});

// Get chart data
router.get('/charts', async (req, res) => {
  try {
    const { period = '30days' } = req.query;

    let interval = '1 day';
    let dateFormat = 'YYYY-MM-DD';
    let periodInterval = '30 days';
    
    switch (period) {
      case '7days':
        interval = '1 day';
        dateFormat = 'YYYY-MM-DD';
        periodInterval = '7 days';
        break;
      case '30days':
        interval = '1 day';
        dateFormat = 'YYYY-MM-DD';
        periodInterval = '30 days';
        break;
      case '90days':
        interval = '1 week';
        dateFormat = 'YYYY-WW';
        periodInterval = '90 days';
        break;
      case '1year':
        interval = '1 month';
        dateFormat = 'YYYY-MM';
        periodInterval = '1 year';
        break;
    }

    // Revenue over time
    const revenueResult = await pool.query(`
      SELECT 
        TO_CHAR(created_at, $1) as date,
        COALESCE(SUM(total_price), 0) as revenue,
        COUNT(*) as bookings
      FROM bookings
      WHERE created_at >= NOW() - INTERVAL '${periodInterval}'
        AND status IN ('confirmed', 'completed')
      GROUP BY TO_CHAR(created_at, $1)
      ORDER BY date
    `, [dateFormat]);

    // Users over time
    const usersResult = await pool.query(`
      SELECT 
        TO_CHAR(created_at, $1) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '${periodInterval}'
      GROUP BY TO_CHAR(created_at, $1)
      ORDER BY date
    `, [dateFormat]);

    res.json({
      success: true,
      charts: {
        revenue: revenueResult.rows,
        users: usersResult.rows
      }
    });

  } catch (error) {
    console.error('Get charts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chart data',
      error: error.message
    });
  }
});

module.exports = router;
