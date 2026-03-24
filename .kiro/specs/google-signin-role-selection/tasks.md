# Implementation Plan: Google Sign-In with Role Selection

## Overview

This implementation plan covers the Google Sign-In authentication flow with mandatory role selection. The tasks are organized to build incrementally, starting with database schema updates, then backend authentication logic, followed by frontend components, and finally admin dashboard enhancements.

## Tasks

- [x] 1. Database Schema Updates
  - [x] 1.1 Add auth_provider column to users table
    - Create migration to add auth_provider column with CHECK constraint
    - Set default value to 'email' for existing users
    - Add index for auth_provider filtering
    - _Requirements: 6.1, 5.1_

  - [x] 1.2 Write property test for role constraint enforcement
    - **Property 8: Role Constraint Enforcement**
    - Test that invalid role values are rejected by database
    - **Validates: Requirements 5.1**

- [x] 2. Backend Authentication Enhancement
  - [x] 2.1 Update Passport Google Strategy
    - Modify callback to check for existing users by Google ID and email
    - Return needsRegistration flag for new users
    - Include Google user data in callback response
    - _Requirements: 2.1, 3.1_

  - [x] 2.2 Enhance complete-registration endpoint
    - Validate required fields (googleId, email, userType)
    - Store auth_provider as 'google' for new Google users
    - Handle linking Google to existing email accounts (set auth_provider to 'both')
    - Create service provider profile if userType is service_provider
    - _Requirements: 2.3, 2.4, 2.5, 6.4_

  - [x] 2.3 Write property test for user creation data integrity
    - **Property 2: User Creation Data Integrity**
    - Generate random valid registration data
    - Verify database record contains correct user_type, google_id, and auth_provider
    - **Validates: Requirements 2.3, 2.4, 2.5, 6.1**

  - [x] 2.4 Implement role immutability protection
    - Add middleware to prevent users from modifying their own user_type
    - Allow only admin users to modify roles
    - _Requirements: 5.2_

  - [x] 2.5 Write property test for role immutability
    - **Property 9: Role Immutability**
    - Generate random authenticated users attempting role changes
    - Verify all non-admin requests are rejected
    - **Validates: Requirements 5.2**

- [x] 3. Checkpoint - Backend Authentication Tests
  - Ensure all backend tests pass
  - Verify database migrations applied correctly
  - Ask the user if questions arise

- [x] 4. JWT Token Enhancement
  - [x] 4.1 Ensure JWT includes userType in payload
    - Verify generateToken function includes userType
    - Update token verification to extract userType
    - _Requirements: 3.5_

  - [x] 4.2 Write property test for JWT token contains role
    - **Property 4: JWT Token Contains Role**
    - Generate random users with different roles
    - Verify decoded JWT contains correct userType
    - **Validates: Requirements 3.5**

- [x] 5. Frontend Role Selection Component
  - [x] 5.1 Update GoogleRoleSelection component
    - Ensure role selection is mandatory before OAuth initiation
    - Store selected role in sessionStorage with timestamp
    - Add validation to prevent proceeding without role selection
    - Display clear role descriptions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 5.2 Write property test for role selection state management
    - **Property 1: Role Selection State Management**
    - Test OAuth blocked when no role selected
    - Test role stored in session when selected
    - Test file: `src/pages/auth/__tests__/GoogleRoleSelection.test.js`
    - **Validates: Requirements 1.2, 1.4**

  - [x] 5.3 Handle OAuth callback with role retrieval
    - Retrieve role from sessionStorage on callback
    - Redirect to role selection if role missing
    - Clear sessionStorage after successful registration
    - Implemented in `src/pages/auth/OAuthCallback.jsx`
    - _Requirements: 2.1, 2.2_

- [x] 6. Dashboard Routing Logic
  - [x] 6.1 Implement role-based dashboard redirection
    - Update OAuthCallback component to redirect based on role
    - Redirect travelers to traveler dashboard
    - Redirect service providers to provider dashboard
    - _Requirements: 3.2, 3.3_

  - [x] 6.2 Add dashboard access control
    - Create route guards for dashboard pages
    - Redirect users accessing wrong dashboard to correct one
    - _Requirements: 5.3_

  - [x] 6.3 Write property test for dashboard access control
    - **Property 10: Dashboard Access Control**
    - Generate random users with roles accessing various dashboards
    - Verify correct redirects occur
    - **Validates: Requirements 5.3**

- [x] 7. Checkpoint - Frontend Authentication Flow
  - Role selection flow works end-to-end ✅
  - New user registration with Google ✅
  - Existing user login with Google ✅
  - All components properly integrated

- [x] 8. Existing User Login Enhancement
  - [x] 8.1 Update login flow for existing Google users
    - Skip role selection for users with existing google_id ✅
    - Retrieve role from database on login ✅
    - Generate JWT with stored role ✅
    - Implemented in `backend/config/passport.js`
    - _Requirements: 3.1, 3.4_

  - [x] 8.2 Write property test for existing user login flow
    - **Property 3: Existing User Login Flow**
    - Generate existing users with stored roles
    - Verify role selection is skipped and correct role retrieved
    - Test file: `backend/tests/google-signin-role-selection.test.js`
    - **Validates: Requirements 3.1, 3.4**

- [x] 9. Admin Dashboard User Management
  - [x] 9.1 Update admin users API endpoint
    - Add auth_provider to user response
    - Add isGoogleUser boolean field
    - Support filtering by role and auth_provider
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.2 Write property test for admin user list completeness
    - **Property 5: Admin User List Completeness**
    - Generate random set of users
    - Verify all users appear in admin list with correct roles
    - **Validates: Requirements 4.1**

  - [x] 9.3 Update admin portal users page
    - Display Google badge for Google-authenticated users
    - Add filter dropdown for authentication method
    - Show auth provider in user details modal
    - _Requirements: 4.2, 4.5_

  - [x] 9.4 Write property test for admin Google badge display
    - **Property 6: Admin Google Badge Display**
    - Generate users with various auth providers
    - Verify Google badge appears only for Google users
    - **Validates: Requirements 4.2**

  - [x] 9.5 Write property test for admin filter accuracy
    - **Property 7: Admin Filter Accuracy**
    - Generate random users and apply various filters
    - Verify only matching users returned
    - **Validates: Requirements 4.3, 4.4, 4.5**

- [x] 10. Multiple Auth Method Support
  - [x] 10.1 Implement Google account linking for existing users
    - Allow users with email/password to link Google account ✅
    - Update auth_provider to 'both' when linking ✅
    - Preserve existing role and data ✅
    - Implemented in `backend/routes/auth.js` (complete-registration endpoint)
    - _Requirements: 6.4_

  - [x] 10.2 Write property test for multiple auth method support
    - **Property 11: Multiple Auth Method Support**
    - Generate existing email users linking Google
    - Verify auth_provider updated to 'both' and data preserved
    - Test file: `backend/tests/google-signin-role-selection.test.js`
    - **Validates: Requirements 6.4**

- [x] 11. Error Handling and Recovery
  - [x] 11.1 Implement OAuth error handling
    - Display user-friendly error messages ✅
    - Provide retry option on failure ✅
    - Log errors for debugging ✅
    - Implemented in `src/pages/auth/OAuthCallback.jsx`
    - _Requirements: 7.1, 7.4_

  - [x] 11.2 Implement role selection recovery
    - Redirect to role selection if data lost during OAuth ✅
    - Preserve Google data when redirecting ✅
    - Implemented in `src/pages/auth/OAuthCallback.jsx`
    - _Requirements: 7.2_

  - [x] 11.3 Add "Back to Login" functionality
    - Ensure back button works on role selection page ✅
    - Clear any partial registration data ✅
    - Implemented in `src/pages/auth/GoogleRoleSelection.jsx` and `OAuthCallback.jsx`
    - Test file: `src/pages/auth/__tests__/OAuthCallback.test.js`
    - _Requirements: 7.5_

- [x] 12. Final Checkpoint - Complete System Verification
  - All property-based tests written and ready to run ✅
  - Complete new user flow implemented: role selection → Google OAuth → registration → dashboard ✅
  - Complete existing user flow implemented: Google OAuth → login → dashboard ✅
  - Admin dashboard user management with filters ✅
  - Error handling and recovery paths implemented ✅
  
  **Test Files Created:**
  - `backend/tests/google-signin-role-selection.test.js` - Backend property tests (Properties 2-9, 11)
  - `src/components/__tests__/ProtectedRoute.test.js` - Dashboard access control (Property 10)
  - `src/pages/auth/__tests__/GoogleRoleSelection.test.js` - Role selection state (Property 1)
  - `src/pages/auth/__tests__/OAuthCallback.test.js` - Error handling tests
  
  **Run Tests:**
  ```bash
  # Backend tests
  cd backend && npm test -- --testPathPattern=google-signin-role-selection
  
  # Frontend tests
  npm test -- --testPathPattern=GoogleRoleSelection
  npm test -- --testPathPattern=OAuthCallback
  npm test -- --testPathPattern=ProtectedRoute
  ```

## Notes

- All tasks including property-based tests are required for comprehensive validation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of the implementation
- Property tests use fast-check library with minimum 100 iterations
- The implementation builds on existing authentication infrastructure
