const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Cloud SQL connection configuration
const pool = new Pool({
  host: '/cloudsql/project-df58b635-5420-42bc-809:us-central1:bouncesteps-db',
  port: 5432,
  user: 'postgres',
  password: '@Jctnftr01',
  database: 'bouncesteps-db'
});

async function runMigration() {
  try {
    console.log('🔄 Connecting to Cloud SQL database...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add-is-active-column.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Running migration...');
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the column was added
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'services' 
      AND column_name IN ('is_active', 'is_trending', 'is_featured')
      ORDER BY column_name
    `);
    
    console.log('\n📊 Verified columns in services table:');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
