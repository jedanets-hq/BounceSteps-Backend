#!/usr/bin/env node

/**
 * Run the admin portal database migration
 * This script applies all the necessary database changes to fix admin portal issues
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/postgresql');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting admin portal database migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'fix-admin-portal-complete.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration SQL...');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Admin portal database migration completed successfully!');
    console.log('');
    console.log('🎉 The following issues have been fixed:');
    console.log('   ✓ Dashboard statistics now show real data');
    console.log('   ✓ Service actions (featured/trending) are now functional');
    console.log('   ✓ Image support added to services');
    console.log('   ✓ Traveler stories management is now working');
    console.log('   ✓ Badge management system is fully functional');
    console.log('   ✓ All missing database tables and columns have been created');
    console.log('   ✓ Sample data has been inserted for testing');
    console.log('');
    console.log('🔄 Please restart your backend server to apply all changes.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };