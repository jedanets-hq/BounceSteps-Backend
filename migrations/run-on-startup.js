const { pool } = require('../config/postgresql');

/**
 * Run critical migrations on server startup
 * This ensures production database has all required tables
 */
async function runStartupMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Running startup migrations...');
    
    // 1. Create provider_followers table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS provider_followers (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT provider_followers_unique UNIQUE(provider_id, user_id)
      )
    `);
    console.log('✅ provider_followers table ready');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_followers_provider ON provider_followers(provider_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_followers_user ON provider_followers(user_id)
    `);
    
    // 2. Create favorites table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT favorites_user_provider_unique UNIQUE(user_id, provider_id),
        CONSTRAINT favorites_user_service_unique UNIQUE(user_id, service_id),
        CONSTRAINT favorites_provider_or_service_check CHECK (
          (provider_id IS NOT NULL AND service_id IS NULL) OR 
          (provider_id IS NULL AND service_id IS NOT NULL)
        )
      )
    `);
    console.log('✅ favorites table ready');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_provider ON favorites(provider_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_service ON favorites(service_id)
    `);
    
    console.log('✅ All startup migrations completed successfully');
  } catch (error) {
    console.error('❌ Startup migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runStartupMigrations };
