const express = require('express');
const router = express.Router();

// Test endpoint to verify admin routes are working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin routes are working',
    timestamp: new Date().toISOString()
  });
});

// Import individual admin route modules with error handling
let adminAuthRoutes, adminUsersRoutes, adminProvidersRoutes, adminPaymentsRoutes, adminDashboardRoutes, adminServicesRoutes;

try {
  adminAuthRoutes = require('./adminAuth');
  adminUsersRoutes = require('./adminUsers');
  adminProvidersRoutes = require('./adminProviders');
  adminPaymentsRoutes = require('./adminPayments');
  adminDashboardRoutes = require('./adminDashboard');
  adminServicesRoutes = require('./adminServices');

  // Mount individual admin route modules
  router.use('/auth', adminAuthRoutes);
  router.use('/users', adminUsersRoutes);
  router.use('/providers', adminProvidersRoutes);
  router.use('/payments', adminPaymentsRoutes);
  router.use('/dashboard', adminDashboardRoutes);
  router.use('/services', adminServicesRoutes);
  
  console.log('✅ All admin routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading admin routes:', error.message);
  
  // Create fallback routes that return proper error messages
  router.get('/dashboard/stats', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin dashboard temporarily unavailable',
      error: 'Database connection required'
    });
  });
  
  router.get('/dashboard/activity', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin dashboard temporarily unavailable',
      error: 'Database connection required'
    });
  });
  
  router.get('/users', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin users temporarily unavailable',
      error: 'Database connection required'
    });
  });
  
  router.get('/providers', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin providers temporarily unavailable',
      error: 'Database connection required'
    });
  });
  
  router.get('/services', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin services temporarily unavailable',
      error: 'Database connection required'
    });
  });
  
  router.get('/payments', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Admin payments temporarily unavailable',
      error: 'Database connection required'
    });
  });
}

// Database connection for existing endpoints
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin routes');
}

// Get trusted partners (public endpoint for homepage)
router.get('/trusted-partners', async (req, res) => {
  try {
    // Return empty array for now - can be populated later
    res.json({
      success: true,
      partners: [],
      count: 0
    });
  } catch (error) {
    console.error('Error fetching trusted partners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trusted partners',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get public trust statistics (for homepage)
router.get('/public/trust-stats', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        success: true,
        stats: {
          totalTravelers: 0,
          totalBookings: 0,
          averageRating: 0,
          totalDestinations: 0
        }
      });
    }

    // Get total travelers
    const travelersResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE user_type = 'traveler'"
    );
    
    // Get total bookings
    const bookingsResult = await pool.query(
      "SELECT COUNT(*) as count FROM bookings WHERE status IN ('confirmed', 'completed')"
    );
    
    // Get average rating (if ratings table exists)
    let averageRating = 0;
    try {
      const ratingResult = await pool.query(
        "SELECT AVG(rating) as avg_rating FROM reviews WHERE rating IS NOT NULL"
      );
      averageRating = parseFloat(ratingResult.rows[0]?.avg_rating || 0);
    } catch (err) {
      // Reviews table might not exist yet
      console.log('Reviews table not found, using default rating');
    }
    
    // Get total destinations (unique locations from services)
    const destinationsResult = await pool.query(
      "SELECT COUNT(DISTINCT location) as count FROM services WHERE location IS NOT NULL"
    );
    
    res.json({
      success: true,
      stats: {
        totalTravelers: parseInt(travelersResult.rows[0]?.count || 0),
        totalBookings: parseInt(bookingsResult.rows[0]?.count || 0),
        averageRating: averageRating,
        totalDestinations: parseInt(destinationsResult.rows[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching trust stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trust statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
