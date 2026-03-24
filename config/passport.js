const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const { User } = require('../models/pg');

// Google OAuth Strategy - Only configure if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Check if using placeholder values
  const isPlaceholder = process.env.GOOGLE_CLIENT_ID === 'your-google-client-id-from-console-cloud-google' ||
                        process.env.GOOGLE_CLIENT_SECRET === 'your-google-client-secret-from-console-cloud-google';
  
  if (isPlaceholder) {
    console.log('⚠️⚠️⚠️ GOOGLE OAUTH CONFIGURATION ERROR ⚠️⚠️⚠️');
    console.log('❌ Google OAuth credentials are using PLACEHOLDER values!');
    console.log('❌ "Continue with Google" and "Sign up with Google" will NOT work!');
    console.log('');
    console.log('📌 TO FIX: Update backend/.env with real Google OAuth credentials');
    console.log('📖 See: TATUA-GOOGLE-OAUTH.md for detailed instructions');
    console.log('🔗 Get credentials from: https://console.cloud.google.com/apis/credentials');
    console.log('');
  } else {
    console.log('✅ Google OAuth configured successfully');
  }
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
    passReqToCallback: true // Enable access to request object
  }, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const googleEmail = profile.emails[0].value.toLowerCase();
    
    // Get flow type: prefer cookie-based value set in route handler (req.googleFlowType),
    // then fallback to state parameter, then default to 'login'
    const flowType = req.googleFlowType || req.query?.state || 'login';
    const isRegistrationFlow = flowType === 'register';
    
    console.log('🔍 Google OAuth - flowType:', flowType, 'isRegistrationFlow:', isRegistrationFlow, 'email:', googleEmail);
    console.log('   req.googleFlowType:', req.googleFlowType, ', req.query.state:', req.query?.state);
    
    // Check if user already exists by Google ID
    let user = await User.findByGoogleId(profile.id);
    
    if (user) {
      // Existing Google user - just log them in
      console.log('✅ Existing Google user found by google_id:', user.email);
      return done(null, user);
    }
    
    // Check by email - user might have registered with email first
    user = await User.findByEmail(googleEmail);

    if (user) {
      // User exists with email, link Google account
      console.log('🔗 Linking Google account to existing email user:', user.email);
      
      // Determine new auth_provider
      const newAuthProvider = user.password ? 'both' : 'google';
      
      await User.update(user.id, { 
        google_id: profile.id,
        avatar_url: user.avatar_url || profile.photos[0]?.value,
        auth_provider: newAuthProvider
      });
      
      // Refresh user data
      user = await User.findById(user.id);
      return done(null, user);
    }

    // NEW USER - Check if this is registration flow or login flow
    if (isRegistrationFlow) {
      // Registration flow - allow new user to complete registration
      console.log('🆕 New Google user in REGISTRATION flow:', googleEmail);
      const userData = {
        googleId: profile.id,
        email: googleEmail,
        firstName: profile.name.givenName || '',
        lastName: profile.name.familyName || '',
        avatarUrl: profile.photos[0]?.value,
        needsRegistration: true
      };
      return done(null, userData);
    } else {
      // LOGIN flow - user not registered, reject
      console.log('❌ Google user NOT REGISTERED (login flow):', googleEmail);
      const userData = {
        email: googleEmail,
        notRegistered: true
      };
      return done(null, userData);
    }
  } catch (error) {
    console.error('❌ Google OAuth Error:', error);
    return done(error, null);
  }
}));
} else {
  console.log('⚠️  Google OAuth not configured - skipping GoogleStrategy');
}

// JWT Strategy
if (process.env.JWT_SECRET) {
  passport.use(new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
  }, async (payload, done) => {
    try {
      const user = await User.findById(payload.id);
      if (user) {
        // Remove password from user object
        delete user.password;
        return done(null, user);
      }
      return done(null, false);
    } catch (error) {
      console.error('❌ JWT Strategy Error:', error);
      return done(error, false);
    }
  }));
} else {
  console.log('⚠️  JWT_SECRET not configured - JWT authentication disabled');
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id || user.googleId);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    let user = await User.findById(id);
    if (!user) {
      user = await User.findByGoogleId(id);
    }
    if (user) {
      delete user.password;
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (error) {
    console.error('❌ Deserialize Error:', error);
    done(error, null);
  }
});

module.exports = passport;
