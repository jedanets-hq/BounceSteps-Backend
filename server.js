const express = require('express');
const cors = require('cors');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

const app = express();

// Import database initialization
const { runStartupMigrations } = require('./migrations/run-on-startup');

// Import routes
const authRoutes = require('./routes/auth');
const servicesRoutes = require('./routes/services');
const providersRoutes = require('./routes/providers');
const bookingsRoutes = require('./routes/bookings');
const cartRoutes = require('./routes/cart');
const favoritesRoutes = require('./routes/favorites');
const plansRoutes = require('./routes/plans');
const usersRoutes = require('./routes/users');
const travelerStoriesRoutes = require('./routes/travelerStories');
const multiTripRoutes = require('./routes/multiTrip');
const fixServicesRoutes = require('./routes/fix-services');
const reviewsRoutes = require('./routes/reviews');
const messagesRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');

// Admin routes
const adminAuthRoutes = require('./routes/adminAuth');
const adminUsersRoutes = require('./routes/adminUsers');
const adminProvidersRoutes = require('./routes/adminProviders');
const adminPaymentsRoutes = require('./routes/adminPayments');
const adminDashboardRoutes = require('./routes/adminDashboard');
const adminServicesRoutes = require('./routes/adminServices');

// Provider payments route
const providerPaymentsRoutes = require('./routes/providerPayments');

// Admin middleware
const { authenticateAdmin } = require('./middleware/adminAuth');

// CORS Configuration for Production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',  // Admin Portal
      'http://localhost:4028',  // Added for Vite dev server
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      // Production domains
      /\.netlify\.app$/,  // Allows all Netlify subdomains
      /\.run\.app$/  // Allows all Google Cloud Run domains
    ];
    
    // In development, allow all localhost origins
    if (isDevelopment && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      if (isDevelopment) {
        console.log('⚠️  Development mode - allowing anyway');
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'expires', 'cache-control', 'pragma'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Middleware
app.use(cors(corsOptions));
// Increase body size limit to 50MB for image uploads (base64 encoded images are large)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware (required for Passport OAuth state verification)
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'isafari-oauth-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 10 * 60 * 1000, // 10 minutes - just for OAuth flow
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Initialize Passport
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/provider-payments', providerPaymentsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/traveler-stories', travelerStoriesRoutes);
app.use('/api/multi-trip', multiTripRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/fix', fixServicesRoutes);

// Admin Portal Routes (No authentication required for local development)
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/providers', adminProvidersRoutes);
app.use('/api/admin/payments', adminPaymentsRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/services', adminServicesRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'iSafari Global API',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'iSafari Global API - Travel & Tourism Platform',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      health: '/health'
    }
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'iSafari Global API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      services: '/api/services',
      providers: '/api/providers',
      bookings: '/api/bookings',
      cart: '/api/cart',
      favorites: '/api/favorites',
      plans: '/api/plans',
      users: '/api/users',
      travelerStories: '/api/traveler-stories',
      stories: '/api/stories',
      multiTrip: '/api/multi-trip',
      reviews: '/api/reviews',
      messages: '/api/messages',
      admin: '/api/admin',
      health: '/health'
    }
  });
});

// Traveler stories endpoint (alias for /api/traveler-stories)
app.use('/api/stories', travelerStoriesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database and start server
const PORT = process.env.PORT || 5000;

async function testDatabaseConnection() {
  try {
    const { pool } = require('./config/postgresql');
    const result = await pool.query('SELECT NOW() as now, current_database() as database');
    console.log('✅ Database connection test successful');
    console.log('   Database:', result.rows[0].database);
    console.log('   Timestamp:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('   Make sure DATABASE_URL or DB_* environment variables are set correctly');
    return false;
  }
}

async function testJWTSecret() {
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is not set!');
    console.error('   Add JWT_SECRET to your environment variables');
    return false;
  }
  console.log('✅ JWT_SECRET is configured');
  return true;
}

async function startServer() {
  try {
    console.log('');
    console.log('🌍 ========================================');
    console.log('🚀 iSafari Global API Server Starting...');
    console.log('========================================');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    
    // Test JWT Secret
    const jwtOk = await testJWTSecret();
    
    // Test database connection (non-blocking)
    let dbOk = false;
    try {
      dbOk = await testDatabaseConnection();
    } catch (error) {
      console.warn('⚠️  WARNING: Database connection test failed:', error.message);
      console.warn('   Server will start anyway. Configure DATABASE_URL to enable database features.');
    }
    
    if (!dbOk) {
      console.warn('⚠️  WARNING: Database not connected!');
      console.warn('   Server will start but database features will not work');
      console.warn('   Set DATABASE_URL environment variable to connect to database');
    }
    
    if (!jwtOk) {
      console.warn('⚠️  WARNING: JWT_SECRET not configured!');
      console.warn('   Set JWT_SECRET environment variable for authentication');
    }
    
    console.log('');
    
    // Start server FIRST (don't wait for migrations)
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🌍 ========================================');
      console.log('🚀 iSafari Global API Server Started');
      console.log('========================================');
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 CORS: Enabled for production domains`);
      console.log(`🗄️  Database: ${dbOk ? '✅ Connected' : '❌ Not Connected'}`);
      console.log(`🔑 JWT: ${jwtOk ? '✅ Configured' : '❌ Not Configured'}`);
      console.log('========================================');
      console.log('');
      console.log('💡 TIP: Set DATABASE_URL and JWT_SECRET environment variables');
      console.log('');
      
      // Run migrations in background AFTER server starts
      if (dbOk) {
        console.log('🔄 Running database migrations in background...');
        runStartupMigrations()
          .then(() => {
            console.log('✅ Background migrations completed successfully');
          })
          .catch((error) => {
            console.warn('⚠️  Background migrations failed:', error.message);
          });
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    // Don't exit - try to start anyway for Cloud Run health checks
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚠️  Server started on port ${PORT} despite errors`);
      console.log('   Configure environment variables to enable full functionality');
    });
  }
}

startServer();

module.exports = app;
