const express = require('express');
const router = express.Router();
const { pool } = require('../config/postgresql');

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
