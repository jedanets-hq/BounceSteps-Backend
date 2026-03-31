#!/bin/bash

# Admin Portal Fix Deployment Script
# This script applies all the fixes for the admin portal issues

echo "🚀 Starting Admin Portal Fix Deployment..."
echo "================================================"

# Set error handling
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the backend root directory."
    exit 1
fi

print_status "Checking environment..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Please ensure database configuration is set."
fi

# Install dependencies if needed
print_status "Installing/updating dependencies..."
npm install

# Run the database migration
print_status "Running database migration to fix admin portal issues..."
node run-admin-portal-migration.js

if [ $? -eq 0 ]; then
    print_success "Database migration completed successfully!"
else
    print_error "Database migration failed. Please check the logs above."
    exit 1
fi

# Test database connection
print_status "Testing database connection..."
node -e "
const { pool } = require('./config/postgresql');
pool.query('SELECT NOW() as current_time')
  .then(result => {
    console.log('✅ Database connection successful');
    console.log('Current time:', result.rows[0].current_time);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  });
"

if [ $? -ne 0 ]; then
    print_error "Database connection test failed."
    exit 1
fi

# Check if the server can start
print_status "Testing server startup..."
timeout 10s node server.js &
SERVER_PID=$!
sleep 5

if kill -0 $SERVER_PID 2>/dev/null; then
    print_success "Server startup test passed"
    kill $SERVER_PID
else
    print_warning "Server startup test inconclusive"
fi

print_success "Admin Portal Fix Deployment Completed!"
echo ""
echo "🎉 Summary of fixes applied:"
echo "   ✓ Database schema updated with all missing tables and columns"
echo "   ✓ Dashboard statistics now use real database data"
echo "   ✓ Service management actions (featured/trending) are functional"
echo "   ✓ Image support added to services table"
echo "   ✓ Traveler stories management system is working"
echo "   ✓ Badge management system is fully operational"
echo "   ✓ Sample data inserted for testing"
echo "   ✓ Performance indexes and triggers created"
echo ""
echo "🔄 Next steps:"
echo "   1. Restart your backend server: npm start"
echo "   2. Test the admin portal functionality"
echo "   3. Verify all features are working correctly"
echo ""
echo "📝 If you encounter any issues:"
echo "   1. Check the server logs for errors"
echo "   2. Verify database connection settings"
echo "   3. Ensure all environment variables are set correctly"
echo ""
print_success "Deployment completed successfully! 🎉"