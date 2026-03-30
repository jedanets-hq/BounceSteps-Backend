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

// Database connection for existing endpoints
let pool;
try {
  pool = require('../config/postgresql').pool;
} catch (error) {
  console.warn('⚠️ Database connection not available for admin routes');
}

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
  
  // Create comprehensive fallback routes with demo data
  
  // Dashboard routes
  router.get('/dashboard/stats', (req, res) => {
    res.json({
      success: true,
      data: {
        users: 1250,
        providers: 85,
        bookings: 342,
        services: 156,
        revenue: 45780.50,
        period: req.query.period || '30days',
        growth: {
          userGrowth: [
            { date: '2026-03-25', new_users: 12 },
            { date: '2026-03-24', new_users: 8 },
            { date: '2026-03-23', new_users: 15 },
            { date: '2026-03-22', new_users: 10 },
            { date: '2026-03-21', new_users: 18 }
          ]
        },
        message: 'Demo data - Admin routes temporarily using fallback data'
      }
    });
  });
  
  router.get('/dashboard/activity', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          type: 'user_registration',
          description: 'New user registered: John Doe',
          timestamp: '2026-03-25T10:30:00Z',
          details: { email: 'john.doe@example.com' }
        },
        {
          type: 'booking_created',
          description: 'New booking for Safari Tour',
          timestamp: '2026-03-25T09:15:00Z',
          details: { booking_date: '2026-04-01', amount: 450 }
        },
        {
          type: 'provider_registration',
          description: 'New provider: Safari Adventures Ltd',
          timestamp: '2026-03-25T08:45:00Z',
          details: { business_type: 'Tour Operator' }
        }
      ].slice(0, parseInt(req.query.limit || 10)),
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
  
  // Users routes
  router.get('/users', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          id: 1,
          name: 'John Doe',
          email: 'john.doe@example.com',
          user_type: 'traveler',
          status: 'active',
          created_at: '2026-03-20T10:00:00Z',
          phone: '+255123456789',
          profile_image: null,
          location: 'Dar es Salaam'
        },
        {
          id: 2,
          name: 'Jane Smith',
          email: 'jane.smith@example.com',
          user_type: 'provider',
          status: 'active',
          created_at: '2026-03-19T14:30:00Z',
          phone: '+255987654321',
          profile_image: null,
          location: 'Arusha'
        }
      ].slice(0, parseInt(req.query.limit || 20)),
      pagination: {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        total: 1250,
        totalPages: 63,
        hasNext: true,
        hasPrev: false
      },
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
  
  // Providers routes
  router.get('/providers', (req, res) => {
    res.json({
      success: true,
      data: {
        providers: [
          {
            id: 1,
            business_name: 'Safari Adventures Ltd',
            business_type: 'Tour Operator',
            description: 'Premium safari experiences in Tanzania',
            location: 'Arusha',
            service_location: 'Serengeti, Ngorongoro',
            country: 'Tanzania',
            region: 'Arusha',
            district: 'Arusha Urban',
            area: 'Central',
            ward: 'Kaloleni',
            is_verified: true,
            rating: 4.8,
            total_bookings: 156,
            created_at: '2026-03-18T12:00:00Z',
            email: 'info@safariadventures.com',
            first_name: 'John',
            last_name: 'Safari',
            phone: '+255123456789',
            is_active: true
          },
          {
            id: 2,
            business_name: 'Mountain Trekking Co',
            business_type: 'Adventure Sports',
            description: 'Mountain climbing and trekking adventures',
            location: 'Moshi',
            service_location: 'Kilimanjaro',
            country: 'Tanzania',
            region: 'Kilimanjaro',
            district: 'Moshi Urban',
            area: 'Central',
            ward: 'Kiboriloni',
            is_verified: false,
            rating: 4.5,
            total_bookings: 89,
            created_at: '2026-03-17T16:45:00Z',
            email: 'contact@mountaintrek.com',
            first_name: 'Jane',
            last_name: 'Mountain',
            phone: '+255987654321',
            is_active: true
          }
        ].slice(0, parseInt(req.query.limit || 20)),
        pagination: {
          currentPage: parseInt(req.query.page) || 1,
          totalPages: 5,
          totalItems: 85,
          itemsPerPage: parseInt(req.query.limit) || 20
        },
        message: 'Demo data - Admin routes temporarily using fallback data'
      }
    });
  });
  
  // Services routes
  router.get('/services', (req, res) => {
    const services = [
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
    ].slice(0, parseInt(req.query.limit || 20));
    
    res.json({
      success: true,
      data: services,
      pages: 8,
      total: 156,
      pagination: {
        currentPage: parseInt(req.query.page) || 1,
        totalPages: 8,
        totalItems: 156,
        itemsPerPage: parseInt(req.query.limit) || 20
      },
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
  
  router.get('/services/stats', (req, res) => {
    res.json({
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
        message: 'Demo data - Admin routes temporarily using fallback data'
      }
    });
  });
  
  router.get('/services/categories', (req, res) => {
    res.json({
      success: true,
      data: [
        { category: 'Wildlife Safari', service_count: 45, avg_price: 750 },
        { category: 'Mountain Trekking', service_count: 32, avg_price: 950 },
        { category: 'Cultural Tours', service_count: 28, avg_price: 450 },
        { category: 'Beach Activities', service_count: 25, avg_price: 350 },
        { category: 'Adventure Sports', service_count: 26, avg_price: 650 }
      ],
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
  
  // Payments routes
  router.get('/payments', (req, res) => {
    res.json({
      success: true,
      data: {
        payments: [
          {
            id: 1,
            amount: 850,
            currency: 'USD',
            status: 'completed',
            payment_method: 'credit_card',
            transaction_reference: 'TXN_001_2026',
            created_at: '2026-03-20T15:30:00Z',
            updated_at: '2026-03-20T15:30:00Z',
            payment_type: 'service_booking',
            description: 'Safari booking payment',
            duration_days: null,
            provider_name: 'Safari Adventures Ltd',
            provider_id: 1,
            user_email: 'john.doe@example.com',
            first_name: 'John',
            last_name: 'Doe'
          },
          {
            id: 2,
            amount: 450,
            currency: 'USD',
            status: 'pending',
            payment_method: 'bank_transfer',
            transaction_reference: 'TXN_002_2026',
            created_at: '2026-03-21T10:15:00Z',
            updated_at: '2026-03-21T10:15:00Z',
            payment_type: 'service_booking',
            description: 'Cultural tour payment',
            duration_days: null,
            provider_name: 'Cultural Tours Inc',
            provider_id: 3,
            user_email: 'jane.smith@example.com',
            first_name: 'Jane',
            last_name: 'Smith'
          }
        ].slice(0, parseInt(req.query.limit || 20)),
        pagination: {
          currentPage: parseInt(req.query.page) || 1,
          totalPages: 18,
          totalItems: 342,
          itemsPerPage: parseInt(req.query.limit) || 20
        },
        message: 'Demo data - Admin routes temporarily using fallback data'
      }
    });
  });
  
  router.get('/payments/stats', (req, res) => {
    res.json({
      success: true,
      data: {
        total: 342,
        successful: 298,
        pending: 44,
        totalRevenue: 45780.50,
        message: 'Demo data - Admin routes temporarily using fallback data'
      }
    });
  });
  
  router.get('/payments/verification-requests', (req, res) => {
    res.json({
      success: true,
      data: [],
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
  
  router.get('/payments/accounts', (req, res) => {
    res.json({
      success: true,
      accounts: [
        {
          id: 1,
          account_type: 'bank_account',
          account_holder_name: 'BounceSteps Ltd',
          account_number: '****1234',
          bank_name: 'Standard Bank',
          mobile_number: null,
          is_active: true,
          created_at: '2026-03-01T00:00:00Z',
          email: 'admin@bouncesteps.com',
          first_name: 'Admin',
          last_name: 'User'
        }
      ],
      message: 'Demo data - Admin routes temporarily using fallback data'
    });
  });
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
