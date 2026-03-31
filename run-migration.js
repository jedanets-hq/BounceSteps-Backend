// Run database migration
const { pool } = require('./config/postgresql');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Running admin portal database migration...');
    
    // Read migration file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', 'fix-admin-portal-issues.sql'),
      'utf8'
    );
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
