const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkServicesCount() {
  console.log('🔍 CHECKING DATABASE SERVICES COUNT\n');
  console.log('='.repeat(60));

  try {
    // Count total services
    const totalResult = await pool.query('SELECT COUNT(*) FROM services');
    console.log(`\n📊 Total services in database: ${totalResult.rows[0].count}`);

    // Count active services
    const activeResult = await pool.query(`
      SELECT COUNT(*) FROM services 
      WHERE is_active = true AND status = 'active'
    `);
    console.log(`✅ Active services: ${activeResult.rows[0].count}`);

    // Count inactive services
    const inactiveResult = await pool.query(`
      SELECT COUNT(*) FROM services 
      WHERE is_active = false OR status != 'active'
    `);
    console.log(`❌ Inactive services: ${inactiveResult.rows[0].count}`);

    // Services by status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM services 
      GROUP BY status
    `);
    console.log('\n📋 Services by status:');
    statusResult.rows.forEach(row => {
      console.log(`   ${row.status || 'NULL'}: ${row.count}`);
    });

    // Services by region
    const regionResult = await pool.query(`
      SELECT region, COUNT(*) as count 
      FROM services 
      WHERE region IS NOT NULL
      GROUP BY region
      ORDER BY count DESC
    `);
    console.log('\n🗺️ Services by region:');
    regionResult.rows.forEach(row => {
      console.log(`   ${row.region}: ${row.count}`);
    });

    // Recent services
    const recentResult = await pool.query(`
      SELECT id, title, category, region, district, status, is_active, created_at
      FROM services 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('\n📅 Recent services (last 10):');
    recentResult.rows.forEach((service, idx) => {
      console.log(`\n${idx + 1}. ${service.title}`);
      console.log(`   Category: ${service.category || 'N/A'}`);
      console.log(`   Location: ${service.district || 'N/A'}, ${service.region || 'N/A'}`);
      console.log(`   Status: ${service.status} | Active: ${service.is_active}`);
      console.log(`   Created: ${service.created_at}`);
    });

    // Check if there are services with NULL status
    const nullStatusResult = await pool.query(`
      SELECT COUNT(*) FROM services WHERE status IS NULL
    `);
    console.log(`\n⚠️ Services with NULL status: ${nullStatusResult.rows[0].count}`);

    // Check providers
    const providersResult = await pool.query(`
      SELECT COUNT(DISTINCT provider_id) as count FROM services WHERE provider_id IS NOT NULL
    `);
    console.log(`\n👥 Unique providers with services: ${providersResult.rows[0].count}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ CHECK COMPLETE\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkServicesCount();
