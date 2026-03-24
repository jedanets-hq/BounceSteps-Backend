/**
 * Custom JWT Authentication Middleware
 * 
 * This middleware wraps Passport's JWT authentication to provide
 * proper error responses (401) instead of default behavior that
 * may return 404 for authentication failures.
 */

const passport = require('passport');

/**
 * Custom JWT authentication middleware that always returns 401 for auth failures
 * instead of potentially returning 404.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateJWT = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    // Handle internal authentication errors
    if (err) {
      console.error('❌ [JWT Auth] Internal error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }

    // Check if token was provided
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('⚠️ [JWT Auth] No token provided for:', req.path);
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    // Token was provided but authentication failed
    if (!user) {
      // Determine the specific error type
      let message = 'Invalid authentication token';
      let code = 'INVALID_TOKEN';

      if (info) {
        if (info.name === 'TokenExpiredError') {
          message = 'Authentication token expired';
          code = 'TOKEN_EXPIRED';
        } else if (info.name === 'JsonWebTokenError') {
          message = 'Invalid authentication token';
          code = 'INVALID_TOKEN';
        } else if (info.message) {
          message = info.message;
        }
      }

      console.warn(`⚠️ [JWT Auth] Authentication failed for ${req.path}: ${message}`);
      return res.status(401).json({
        success: false,
        message,
        code
      });
    }

    // Authentication successful - attach user to request
    req.user = user;
    
    // Check if user account is active (not suspended)
    if (user.is_active === false) {
      console.warn(`⚠️ [JWT Auth] Suspended user ${user.id} attempted to access ${req.path}`);
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended by Admin. Please contact support for assistance at: support@isafari.co.tz',
        code: 'ACCOUNT_SUSPENDED'
      });
    }
    
    console.log(`✅ [JWT Auth] User ${user.id} authenticated for ${req.path}`);
    next();
  })(req, res, next);
};

/**
 * Optional JWT authentication - doesn't fail if no token provided
 * Useful for endpoints that work differently for authenticated vs anonymous users
 */
const optionalJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // If no token, just continue without user
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  // If token provided, try to authenticate
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      console.error('❌ [JWT Auth Optional] Error:', err.message);
      req.user = null;
      return next();
    }

    req.user = user || null;
    next();
  })(req, res, next);
};

module.exports = { 
  authenticateJWT,
  optionalJWT
};
