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
    
    // 3. Add missing columns to services table (FIX for "Failed to create service" error)
    console.log('🔧 Checking services table columns...');
    
    // Add max_participants column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='max_participants') THEN
          ALTER TABLE services ADD COLUMN max_participants INTEGER;
        END IF;
      END $$;
    `);
    
    // Add region column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='region') THEN
          ALTER TABLE services ADD COLUMN region VARCHAR(100);
        END IF;
      END $$;
    `);
    
    // Add district column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='district') THEN
          ALTER TABLE services ADD COLUMN district VARCHAR(100);
        END IF;
      END $$;
    `);
    
    // Add area column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='area') THEN
          ALTER TABLE services ADD COLUMN area VARCHAR(100);
        END IF;
      END $$;
    `);
    
    // Add country column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='country') THEN
          ALTER TABLE services ADD COLUMN country VARCHAR(100) DEFAULT 'Tanzania';
        END IF;
      END $$;
    `);
    
    // Add amenities column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='amenities') THEN
          ALTER TABLE services ADD COLUMN amenities JSONB DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `);
    
    // Add payment_methods column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='payment_methods') THEN
          ALTER TABLE services ADD COLUMN payment_methods JSONB DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    
    // Add contact_info column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='contact_info') THEN
          ALTER TABLE services ADD COLUMN contact_info JSONB DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    
    // Add is_active column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='is_active') THEN
          ALTER TABLE services ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    
    // Add average_rating column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='services' AND column_name='average_rating') THEN
          ALTER TABLE services ADD COLUMN average_rating DECIMAL(3,2) DEFAULT 0.0;
        END IF;
      END $$;
    `);
    
    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_region ON services(region)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_district ON services(district)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_area ON services(area)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)
    `);
    
    console.log('✅ services table columns updated');
    
    // 4. Fix foreign key constraint - should point to service_providers, not users
    console.log('🔧 Fixing services foreign key constraint...');
    
    // Drop incorrect constraint if it exists
    await client.query(`
      ALTER TABLE services 
      DROP CONSTRAINT IF EXISTS services_provider_id_fkey
    `);
    
    // Add correct constraint pointing to service_providers table
    await client.query(`
      ALTER TABLE services 
      ADD CONSTRAINT services_provider_id_fkey 
      FOREIGN KEY (provider_id) 
      REFERENCES service_providers(id) 
      ON DELETE CASCADE
    `);
    
    console.log('✅ Foreign key constraint fixed - now points to service_providers table');
    
    console.log('✅ All startup migrations completed successfully');
  } catch (error) {
    console.error('❌ Startup migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { runStartupMigrations };
