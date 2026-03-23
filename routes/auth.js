const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const { getValidationMiddleware } = require('../middleware/validation');
const { handleDuplicateKeyError } = require('../middleware/duplicateHandler');
const { User, ServiceProvider } = require('../models');
const router = express.Router();

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      userType: user.user_type 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register endpoint - PostgreSQL version
router.post('/register', getValidationMiddleware('register'), async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, userType, phone, googleId,
      serviceLocation, serviceCategories, locationData, companyName, businessType, description
    } = req.body;

    console.log('📝 Registration attempt for:', email, 'userType:', userType);

    // Check if user already exists by email (PostgreSQL)
    const existingUser = await User.findByEmail(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Please use a different email or try logging in.',
        field: 'email'
      });
    }

    // Check if Google ID already exists (only if googleId is provided)
    if (googleId) {
      const existingGoogleUser = await User.findByGoogleId(googleId);
      if (existingGoogleUser) {
        return res.status(400).json({
          success: false,
          message: 'This Google account is already registered'
        });
      }
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    // Create user (PostgreSQL)
    const newUser = await User.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      user_type: userType,
      google_id: googleId || null
    });

    console.log('✅ User created:', newUser.id, newUser.email);

    // Create service provider profile if user is a service provider
    if (userType === 'service_provider') {
      const businessName = companyName || `${firstName} ${lastName}'s Business`;
      
      // Ensure location data exists
      const providerLocationData = locationData || {};
      const serviceLocationString = serviceLocation || 
        `${providerLocationData.street || ''}, ${providerLocationData.ward || ''}, ${providerLocationData.district || ''}, ${providerLocationData.region || ''}, Tanzania`
        .replace(/^, |, , /g, ', ').replace(/^, /, '').trim();
      
      await ServiceProvider.create({
        user_id: newUser.id,
        business_name: businessName,
        business_type: businessType || 'General Services',
        description: description || `Professional services provided by ${businessName}`,
        location: serviceLocationString,
        service_location: serviceLocationString,
        country: providerLocationData.country || 'Tanzania',
        region: providerLocationData.region || '',
        district: providerLocationData.district || '',
        area: providerLocationData.street || providerLocationData.area || '',
        ward: providerLocationData.ward || '',
        location_data: providerLocationData,
        service_categories: serviceCategories || []
      });
      console.log('✅ Service provider profile created');
    }

    // Generate token
    const token = generateToken(newUser);

    // Build response with provider data if service provider
    const responseUser = {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      userType: newUser.user_type,
      phone: newUser.phone,
      isVerified: newUser.is_verified
    };

    // Add provider data for service providers
    if (userType === 'service_provider') {
      responseUser.companyName = companyName || `${firstName} ${lastName}'s Business`;
      responseUser.businessName = companyName || `${firstName} ${lastName}'s Business`;
      responseUser.businessType = businessType || 'General Services';
      responseUser.description = description || '';
      responseUser.serviceLocation = serviceLocation || '';
      responseUser.serviceCategories = serviceCategories || [];
      responseUser.locationData = locationData || {};
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: responseUser,
      token
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : 'hidden in production'
    });
    
    // Handle PostgreSQL unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Please use a different email or try logging in.',
        field: 'email',
        code: 'DUPLICATE_EMAIL'
      });
    }

    // Handle database connection errors
    if (error.message && error.message.includes('connect')) {
      console.error('❌ Database connection error detected');
      return res.status(500).json({
        success: false,
        message: 'Database connection error. Please try again later.',
        code: 'DB_CONNECTION_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Handle missing environment variables
    if (error.message && error.message.includes('JWT_SECRET')) {
      console.error('❌ JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error. Please contact support.',
        code: 'CONFIG_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      code: 'REGISTRATION_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login endpoint - PostgreSQL version
router.post('/login', getValidationMiddleware('login'), async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    // Find user by email (PostgreSQL)
    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        field: 'email'
      });
    }

    console.log('✅ User found:', user.id, user.email, 'has_password:', !!user.password);

    // Check if user is active (blocked/suspended by admin)
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended by Admin. Please contact support for assistance at: support@isafari.co.tz',
        field: 'account',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Verify password
    if (!password || !user.password) {
      console.log('❌ Password missing - user.password exists:', !!user.password, 'input password exists:', !!password);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        field: 'password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔑 Password validation result:', isPasswordValid);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        field: 'password'
      });
    }

    // Generate token
    const token = generateToken(user);

    // If service provider, get provider profile data INCLUDING BADGE
    let providerData = {};
    if (user.user_type === 'service_provider') {
      const provider = await ServiceProvider.findOne({ user_id: parseInt(user.id) });
      if (provider) {
        // Parse location_data if it's a string (PostgreSQL JSONB can return string)
        let locationData = provider.location_data;
        if (typeof locationData === 'string') {
          try {
            locationData = JSON.parse(locationData);
          } catch (e) {
            locationData = {};
          }
        }
        
        // Get provider badge from provider_badges table
        const { pool } = require('../models');
        const badgeResult = await pool.query(
          'SELECT badge_type, assigned_at, expires_at FROM provider_badges WHERE provider_id = $1',
          [provider.id]
        );
        const badge = badgeResult.rows[0];
        
        providerData = {
          companyName: provider.business_name || '',
          businessName: provider.business_name || '',
          businessType: provider.business_type || '',
          description: provider.description || '',
          serviceLocation: provider.service_location || provider.location || '',
          serviceCategories: provider.service_categories || [],
          badgeType: badge?.badge_type || null, // Add badge type to user data
          locationData: locationData && typeof locationData === 'object' ? locationData : {
            region: provider.region || '',
            district: provider.district || '',
            ward: provider.ward || '',
            street: provider.area || ''
          }
        };
      }
    }

    console.log('✅ Login successful for:', user.email);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        phone: user.phone,
        isVerified: user.is_verified,
        avatar: user.avatar_url,
        // Include provider data for service providers
        ...providerData
      },
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper to parse a specific cookie from the cookie header string
const parseCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

// Google OAuth - Start authentication for LOGIN (existing users only)
router.get('/google', (req, res, next) => {
  console.log('🔐 Google OAuth LOGIN flow started');
  // Set cookie to reliably track flow type across OAuth redirect chain
  res.cookie('google_auth_flow', 'login', {
    maxAge: 10 * 60 * 1000, // 10 minutes
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: 'login'
  })(req, res, next);
});

// Google OAuth - Start authentication for REGISTRATION (new users)
router.get('/google/register', (req, res, next) => {
  console.log('📝 Google OAuth REGISTRATION flow started');
  // Set cookie to reliably track flow type across OAuth redirect chain
  res.cookie('google_auth_flow', 'register', {
    maxAge: 10 * 60 * 1000, // 10 minutes
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: 'register'
  })(req, res, next);
});

// Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  // Get flow type from cookie (most reliable) then fallback to state parameter
  const cookieFlowType = parseCookieValue(req.headers.cookie, 'google_auth_flow');
  const stateFlowType = req.query.state;
  const flowType = cookieFlowType || stateFlowType || 'login';
  console.log('🔄 Google OAuth callback - flow type:', flowType, '(cookie:', cookieFlowType, ', state:', stateFlowType, ')');
  console.log('🌐 FRONTEND_URL:', process.env.FRONTEND_URL);
  
  // Store flow type on request for passport strategy to use
  req.googleFlowType = flowType;
  
  // Clear the flow tracking cookie
  res.clearCookie('google_auth_flow', { path: '/' });
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://isafari-tz.netlify.app';
  passport.authenticate('google', { session: false, failureRedirect: `${frontendUrl}/login?error=google_auth_failed` })(req, res, next);
}, async (req, res) => {
    try {
      // CRITICAL: Use production frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'https://isafari-tz.netlify.app';
      const flowType = req.googleFlowType || 'login';
      
      console.log('📍 Redirecting to frontend:', frontendUrl);
      
      // Check if user is NOT registered and tried to LOGIN
      if (req.user.notRegistered) {
        console.log('❌ User not registered, redirecting to login with error:', req.user.email);
        const redirectUrl = `${frontendUrl}/login?error=not_registered&email=${encodeURIComponent(req.user.email)}`;
        console.log('🔗 Redirect URL:', redirectUrl);
        return res.redirect(redirectUrl);
      }
      
      // Check if user needs to complete registration (new Google user in REGISTRATION flow)
      if (req.user.needsRegistration) {
        // Create Google data object
        const googleDataObj = {
          googleId: req.user.googleId,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          avatarUrl: req.user.avatarUrl
        };
        
        // Use URL-safe Base64 encoding for safer URL transmission
        // CRITICAL: Use base64url to avoid +/= corruption in URL query strings
        const googleDataBase64 = Buffer.from(JSON.stringify(googleDataObj)).toString('base64url');
        
        console.log('🔄 New Google user in registration flow, redirecting to complete registration');
        console.log('📧 Email:', req.user.email);
        console.log('🔗 GoogleData base64url length:', googleDataBase64.length);
        
        // Redirect to role selection with Google data (encodeURIComponent for extra safety)
        return res.redirect(`${frontendUrl}/google-role-selection?googleData=${encodeURIComponent(googleDataBase64)}`);
      }
      
      // Existing user - generate token and redirect
      const token = generateToken(req.user);
      console.log('✅ Existing Google user logged in:', req.user.email);
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('❌ Google OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'https://isafari-tz.netlify.app';
      res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }
  }
);

// Get current user
router.get('/me', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        phone: user.phone,
        isVerified: user.is_verified,
        avatar: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
});

// Check Google OAuth configuration status
router.get('/google/status', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  const isConfigured = clientId && 
                       clientSecret && 
                       clientId !== 'your-google-client-id-from-console-cloud-google' &&
                       clientSecret !== 'your-google-client-secret-from-console-cloud-google';
  
  res.json({
    success: true,
    configured: isConfigured,
    message: isConfigured 
      ? 'Google OAuth is configured and ready to use' 
      : 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env'
  });
});

// Complete Google Registration - For new Google users who need to select user type
router.post('/google/complete-registration', async (req, res) => {
  try {
    const { 
      googleId, email, firstName, lastName, avatarUrl, userType,
      phone, serviceLocation, serviceCategories, locationData, 
      companyName, businessType, description 
    } = req.body;

    console.log('📝 Google registration completion for:', email, 'userType:', userType);
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

    // Validate required fields
    if (!googleId || !email || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: googleId, email, and userType are required'
      });
    }

    // Validate userType is valid
    if (!['traveler', 'service_provider'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account type selected. Must be "traveler" or "service_provider"'
      });
    }
    
    // Validate traveler-specific fields
    if (userType === 'traveler') {
      if (!firstName || !firstName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'First name is required for travelers',
          field: 'firstName'
        });
      }
      if (!lastName || !lastName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Last name is required for travelers',
          field: 'lastName'
        });
      }
    }
    
    // Validate service provider-specific fields
    if (userType === 'service_provider') {
      if (!companyName || !companyName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Company name is required for service providers',
          field: 'companyName'
        });
      }
      if (!locationData || !locationData.region || !locationData.district) {
        return res.status(400).json({
          success: false,
          message: 'Service location (Region and District) is required for service providers',
          field: 'serviceLocation'
        });
      }
      if (!serviceCategories || serviceCategories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one service category is required for service providers',
          field: 'serviceCategories'
        });
      }
    }

    // Check if user already exists by Google ID
    let existingUser = await User.findByGoogleId(googleId);
    if (existingUser) {
      // User already exists, just log them in
      const token = generateToken(existingUser);
      console.log('✅ Existing Google user logged in:', existingUser.email);
      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.first_name,
          lastName: existingUser.last_name,
          userType: existingUser.user_type,
          phone: existingUser.phone,
          isVerified: existingUser.is_verified,
          avatar: existingUser.avatar_url,
          authProvider: existingUser.auth_provider
        },
        token
      });
    }

    // Check if email already exists (user registered with email, now linking Google)
    existingUser = await User.findByEmail(email.toLowerCase().trim());
    if (existingUser) {
      // Link Google account to existing user - update auth_provider to 'both' if they have password
      const newAuthProvider = existingUser.password ? 'both' : 'google';
      await User.update(existingUser.id, { 
        google_id: googleId, 
        avatar_url: avatarUrl || existingUser.avatar_url,
        auth_provider: newAuthProvider
      });
      
      const token = generateToken(existingUser);
      console.log('✅ Google account linked to existing user:', existingUser.email, 'auth_provider:', newAuthProvider);
      return res.json({
        success: true,
        message: 'Google account linked successfully',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.first_name,
          lastName: existingUser.last_name,
          userType: existingUser.user_type,
          phone: existingUser.phone,
          isVerified: existingUser.is_verified,
          avatar: avatarUrl || existingUser.avatar_url,
          authProvider: newAuthProvider
        },
        token
      });
    }

    // Create new user with Google data - auth_provider will be 'google'
    const newUser = await User.create({
      email: email.toLowerCase().trim(),
      password: null, // No password for Google users
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      user_type: userType,
      google_id: googleId,
      avatar_url: avatarUrl,
      is_verified: true, // Google users are auto-verified
      auth_provider: 'google'
    });

    console.log('✅ New Google user created:', newUser.id, newUser.email, 'auth_provider: google');

    // Create service provider profile if user is a service provider
    if (userType === 'service_provider') {
      const businessName = companyName || `${firstName} ${lastName}'s Business`;
      
      const providerLocationData = locationData || {};
      const serviceLocationString = serviceLocation || 
        `${providerLocationData.street || ''}, ${providerLocationData.ward || ''}, ${providerLocationData.district || ''}, ${providerLocationData.region || ''}, Tanzania`
        .replace(/^, |, , /g, ', ').replace(/^, /, '').trim();
      
      await ServiceProvider.create({
        user_id: newUser.id,
        business_name: businessName,
        business_type: businessType || 'General Services',
        description: description || `Professional services provided by ${businessName}`,
        location: serviceLocationString,
        service_location: serviceLocationString,
        country: providerLocationData.country || 'Tanzania',
        region: providerLocationData.region || '',
        district: providerLocationData.district || '',
        area: providerLocationData.street || providerLocationData.area || '',
        ward: providerLocationData.ward || '',
        location_data: providerLocationData,
        service_categories: serviceCategories || []
      });
      console.log('✅ Service provider profile created for Google user');
    }

    // Generate token
    const token = generateToken(newUser);

    // Build response
    const responseUser = {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      userType: newUser.user_type,
      phone: newUser.phone,
      isVerified: true,
      avatar: avatarUrl,
      authProvider: 'google'
    };

    // Add provider data for service providers
    if (userType === 'service_provider') {
      responseUser.companyName = companyName || `${firstName} ${lastName}'s Business`;
      responseUser.businessName = companyName || `${firstName} ${lastName}'s Business`;
      responseUser.businessType = businessType || 'General Services';
      responseUser.description = description || '';
      responseUser.serviceLocation = serviceLocation || '';
      responseUser.serviceCategories = serviceCategories || [];
      responseUser.locationData = locationData || {};
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: responseUser,
      token
    });

  } catch (error) {
    console.error('❌ Google registration completion error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
        field: 'email'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Forgot Password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findByEmail(email.toLowerCase().trim());
    
    // Always return success for security (don't reveal if email exists)
    if (user) {
      // Generate reset token
      const resetToken = jwt.sign(
        { id: user.id, email: user.email, type: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      console.log(`Password reset requested for: ${email}`);
      // TODO: Implement email sending
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

module.exports = router;
