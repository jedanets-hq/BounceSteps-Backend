/**
 * Migrations to run on server startup
 * This ensures database schema is always up to date
 */

const { pool } = require('../config/postgresql');

async function runStartupMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Running startup migrations...');
    
    // Migration 0: Create service_providers table if it doesn't exist
    console.log('\n📋 Creating service_providers table...');
    
    const serviceProvidersTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'service_providers'
      );
    `);
    
    if (!serviceProvidersTableCheck.rows[0].exists) {
      console.log('🔧 Creating service_providers table...');
      
      await client.query(`
        CREATE TABLE service_providers (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          business_name VARCHAR(255) NOT NULL,
          business_type VARCHAR(255) DEFAULT 'General Services',
          description TEXT,
          location TEXT,
          service_location TEXT,
          country VARCHAR(100) DEFAULT 'Tanzania',
          region VARCHAR(100),
          district VARCHAR(100),
          area VARCHAR(255),
          ward VARCHAR(100),
          location_data JSONB DEFAULT '{}',
          service_categories JSONB DEFAULT '[]',
          is_verified BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          rating DECIMAL(3,2) DEFAULT 0.0,
          total_bookings INTEGER DEFAULT 0,
          badge_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        );
        
        CREATE INDEX idx_service_providers_user_id ON service_providers(user_id);
        CREATE INDEX idx_service_providers_region ON service_providers(region);
        CREATE INDEX idx_service_providers_district ON service_providers(district);
        CREATE INDEX idx_service_providers_is_active ON service_providers(is_active);
      `);
      
      console.log('✅ service_providers table created');
    } else {
      console.log('✅ service_providers table already exists');
    }
    
    // Migration 1: Fix bookings table schema - add missing columns
    console.log('\n📋 Fixing bookings table schema...');
    
    // Add service_id column if missing
    const serviceIdCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'service_id'
    `);
    
    if (serviceIdCheck.rows.length === 0) {
      console.log('➕ Adding service_id column...');
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE CASCADE
      `);
      console.log('✅ service_id column added');
    }
    
    // Add travel_date column if missing
    const travelDateCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'travel_date'
    `);
    
    if (travelDateCheck.rows.length === 0) {
      console.log('➕ Adding travel_date column...');
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN travel_date DATE
      `);
      console.log('✅ travel_date column added');
    }
    
    // Add participants column if missing
    const participantsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'participants'
    `);
    
    if (participantsCheck.rows.length === 0) {
      console.log('➕ Adding participants column...');
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN participants INTEGER DEFAULT 1
      `);
      console.log('✅ participants column added');
    }
    
    // Add total_price column if missing
    const totalPriceCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'total_price'
    `);
    
    if (totalPriceCheck.rows.length === 0) {
      console.log('➕ Adding total_price column...');
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN total_price DECIMAL(10,2)
      `);
      console.log('✅ total_price column added');
    }
    
    // Add special_requests column if missing
    const specialRequestsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' AND column_name = 'special_requests'
    `);
    
    if (specialRequestsCheck.rows.length === 0) {
      console.log('➕ Adding special_requests column...');
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN special_requests TEXT
      `);
      console.log('✅ special_requests column added');
    }
    
    // Add denormalized columns for better performance
    const denormalizedColumns = [
      { name: 'service_title', type: 'VARCHAR(255)' },
      { name: 'service_description', type: 'TEXT' },
      { name: 'service_images', type: 'JSONB' },
      { name: 'service_location', type: 'TEXT' },
      { name: 'service_price', type: 'DECIMAL(10,2)' },
      { name: 'service_category', type: 'VARCHAR(100)' },
      { name: 'business_name', type: 'VARCHAR(255)' },
      { name: 'provider_phone', type: 'VARCHAR(20)' },
      { name: 'provider_email', type: 'VARCHAR(255)' },
      { name: 'traveler_first_name', type: 'VARCHAR(100)' },
      { name: 'traveler_last_name', type: 'VARCHAR(100)' },
      { name: 'rating', type: 'DECIMAL(3,2)' }
    ];
    
    for (const col of denormalizedColumns) {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = $1
      `, [col.name]);
      
      if (colCheck.rows.length === 0) {
        await client.query(`
          ALTER TABLE bookings 
          ADD COLUMN ${col.name} ${col.type}
        `);
      }
    }
    
    console.log('✅ Bookings table schema fixed');
    
    // Migration 2: Add missing columns to service_providers table
    console.log('\n📋 Fixing service_providers table schema...');
    
    // Add business_phone column if missing
    const businessPhoneCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'service_providers' AND column_name = 'business_phone'
    `);
    
    if (businessPhoneCheck.rows.length === 0) {
      console.log('➕ Adding business_phone column...');
      await client.query(`
        ALTER TABLE service_providers 
        ADD COLUMN business_phone VARCHAR(20)
      `);
      console.log('✅ business_phone column added');
    }
    
    // Add business_email column if missing
    const businessEmailCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'service_providers' AND column_name = 'business_email'
    `);
    
    if (businessEmailCheck.rows.length === 0) {
      console.log('➕ Adding business_email column...');
      await client.query(`
        ALTER TABLE service_providers 
        ADD COLUMN business_email VARCHAR(255)
      `);
      console.log('✅ business_email column added');
    }
    
    // Add phone column if missing (for backward compatibility)
    const phoneCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'service_providers' AND column_name = 'phone'
    `);
    
    if (phoneCheck.rows.length === 0) {
      console.log('➕ Adding phone column...');
      await client.query(`
        ALTER TABLE service_providers 
        ADD COLUMN phone VARCHAR(20)
      `);
      console.log('✅ phone column added');
    }
    
    // Add email column if missing (for backward compatibility)
    const emailCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'service_providers' AND column_name = 'email'
    `);
    
    if (emailCheck.rows.length === 0) {
      console.log('➕ Adding email column...');
      await client.query(`
        ALTER TABLE service_providers 
        ADD COLUMN email VARCHAR(255)
      `);
      console.log('✅ email column added');
    }
    
    console.log('✅ Service_providers table schema fixed');
    
    // Migration 4: Add 'draft' status to bookings constraint
    console.log('\n📋 Checking bookings status constraint...');
    
    // Check if constraint exists and what values it allows
    const constraintCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'bookings'::regclass 
      AND conname = 'bookings_status_check'
    `);
    
    const needsUpdate = constraintCheck.rows.length === 0 || 
      !constraintCheck.rows[0]?.definition?.includes('draft');
    
    if (needsUpdate) {
      console.log('🔄 Updating bookings status constraint to include draft...');
      
      // Drop existing constraint if exists
      await client.query(`
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check
      `);
      
      // Add new constraint with draft included
      await client.query(`
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_check 
        CHECK (status IN ('draft', 'pending', 'confirmed', 'cancelled', 'completed'))
      `);
      
      console.log('✅ Bookings status constraint updated!');
    } else {
      console.log('✅ Bookings status constraint already includes draft');
    }
    
    // Migration 5: Add auth_provider column for Google Sign-In tracking
    console.log('\n📋 Checking auth_provider column...');
    
    const authProviderCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'auth_provider'
    `);
    
    if (authProviderCheck.rows.length === 0) {
      console.log('🔄 Adding auth_provider column...');
      
      // Add auth_provider column with CHECK constraint
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'email' 
        CHECK (auth_provider IN ('email', 'google', 'both'))
      `);
      
      // Update existing users with google_id to have auth_provider = 'google'
      await client.query(`
        UPDATE users 
        SET auth_provider = 'google' 
        WHERE google_id IS NOT NULL AND password IS NULL
      `);
      
      // Update existing users with both google_id and password to have auth_provider = 'both'
      await client.query(`
        UPDATE users 
        SET auth_provider = 'both' 
        WHERE google_id IS NOT NULL AND password IS NOT NULL
      `);
      
      // Create index for auth_provider filtering
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider)
      `);
      
      console.log('✅ auth_provider column added!');
    } else {
      console.log('✅ auth_provider column already exists');
    }
    
    console.log('\n✅ Startup migrations completed!');
    
    // Migration 6: Fix bookings foreign key constraint
    console.log('\n📋 Fixing bookings foreign key constraint...');
    
    // Check current constraint
    const fkCheck = await client.query(`
      SELECT ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'bookings'
        AND kcu.column_name = 'provider_id'
        AND tc.constraint_name = 'bookings_provider_id_fkey'
    `);
    
    const needsFix = fkCheck.rows.length === 0 || fkCheck.rows[0].foreign_column_name === 'user_id';
    
    if (needsFix) {
      console.log('🔧 Fixing incorrect foreign key constraint...');
      
      // Drop incorrect constraint
      await client.query(`
        ALTER TABLE bookings 
        DROP CONSTRAINT IF EXISTS bookings_provider_id_fkey
      `);
      
      // Add correct constraint
      await client.query(`
        ALTER TABLE bookings 
        ADD CONSTRAINT bookings_provider_id_fkey 
        FOREIGN KEY (provider_id) 
        REFERENCES service_providers(id) 
        ON DELETE CASCADE
      `);
      
      console.log('✅ Foreign key constraint fixed: provider_id -> service_providers.id');
    } else {
      console.log('✅ Foreign key constraint is already correct');
    }
    
    // Migration 7: Ensure all services have valid service_provider records
    console.log('\n📋 Checking service-provider data integrity...');
    
    const orphanedServices = await client.query(`
      SELECT DISTINCT s.provider_id, u.email, u.first_name, u.last_name
      FROM services s
      LEFT JOIN service_providers sp ON s.provider_id = sp.user_id
      LEFT JOIN users u ON s.provider_id = u.id
      WHERE sp.id IS NULL AND s.provider_id IS NOT NULL
      LIMIT 10
    `);
    
    if (orphanedServices.rows.length > 0) {
      console.log(`🔧 Found ${orphanedServices.rows.length} services without provider records, creating them...`);
      
      for (const user of orphanedServices.rows) {
        try {
          await client.query(`
            INSERT INTO service_providers (
              user_id,
              business_name,
              description,
              business_type,
              location,
              rating,
              total_bookings,
              is_verified,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            ON CONFLICT (user_id) DO NOTHING
          `, [
            user.provider_id,
            `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Service Provider',
            'Service provider',
            'General Services',
            'Tanzania',
            0,
            0,
            false
          ]);
          console.log(`  ✅ Created provider record for user ${user.provider_id}`);
        } catch (err) {
          console.log(`  ⚠️  Could not create provider for user ${user.provider_id}:`, err.message);
        }
      }
      
      console.log('✅ Service-provider data integrity check completed!');
    } else {
      console.log('✅ All services have valid provider records');
    }
    
    // Migration 8: Create reviews table
    console.log('\n📋 Creating reviews table...');
    
    const reviewsTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'reviews'
      );
    `);
    
    if (!reviewsTableCheck.rows[0].exists) {
      console.log('🔧 Creating reviews table...');
      
      await client.query(`
        CREATE TABLE reviews (
          id SERIAL PRIMARY KEY,
          service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          review_text TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(service_id, user_id, booking_id)
        );
        
        CREATE INDEX idx_reviews_service_id ON reviews(service_id);
        CREATE INDEX idx_reviews_user_id ON reviews(user_id);
        CREATE INDEX idx_reviews_booking_id ON reviews(booking_id);
      `);
      
      console.log('✅ Reviews table created');
      
      // Add average_rating column to services if missing
      const avgRatingCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'services' AND column_name = 'average_rating'
      `);
      
      if (avgRatingCheck.rows.length === 0) {
        console.log('➕ Adding average_rating column to services...');
        await client.query(`
          ALTER TABLE services 
          ADD COLUMN average_rating DECIMAL(3,2) DEFAULT 0
        `);
        console.log('✅ average_rating column added');
      }
      
      // Create trigger function to update service rating
      await client.query(`
        CREATE OR REPLACE FUNCTION update_service_rating()
        RETURNS TRIGGER AS $$
        BEGIN
          UPDATE services
          SET average_rating = (
            SELECT COALESCE(AVG(rating), 0)
            FROM reviews
            WHERE service_id = COALESCE(NEW.service_id, OLD.service_id)
          )
          WHERE id = COALESCE(NEW.service_id, OLD.service_id);
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS trigger_update_service_rating ON reviews;
        CREATE TRIGGER trigger_update_service_rating
        AFTER INSERT OR UPDATE OR DELETE ON reviews
        FOR EACH ROW
        EXECUTE FUNCTION update_service_rating();
      `);
      
      console.log('✅ Service rating trigger created');
      
      // Create trigger function to update provider rating
      await client.query(`
        CREATE OR REPLACE FUNCTION update_provider_rating()
        RETURNS TRIGGER AS $$
        BEGIN
          UPDATE service_providers
          SET rating = (
            SELECT COALESCE(AVG(r.rating), 0)
            FROM reviews r
            JOIN services s ON r.service_id = s.id
            WHERE s.provider_id = (
              SELECT provider_id FROM services WHERE id = COALESCE(NEW.service_id, OLD.service_id)
            )
          )
          WHERE id = (
            SELECT provider_id FROM services WHERE id = COALESCE(NEW.service_id, OLD.service_id)
          );
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS trigger_update_provider_rating ON reviews;
        CREATE TRIGGER trigger_update_provider_rating
        AFTER INSERT OR UPDATE OR DELETE ON reviews
        FOR EACH ROW
        EXECUTE FUNCTION update_provider_rating();
      `);
      
      console.log('✅ Provider rating trigger created');
    } else {
      console.log('✅ Reviews table already exists');
    }
    
    // Migration 9: Add status column to traveler_stories table
    console.log('\n📋 Adding status column to traveler_stories table...');
    
    const statusColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'traveler_stories' AND column_name = 'status'
    `);
    
    if (statusColumnCheck.rows.length === 0) {
      console.log('🔧 Adding status column with approval workflow...');
      
      await client.query(`
        ALTER TABLE traveler_stories 
        ADD COLUMN status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected'))
      `);
      
      // Add index for faster queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_traveler_stories_status ON traveler_stories(status)
      `);
      
      // Update existing stories to approved (backward compatibility)
      await client.query(`
        UPDATE traveler_stories SET status = 'approved' WHERE status IS NULL
      `);
      
      console.log('✅ Status column added to traveler_stories table');
    } else {
      console.log('✅ Status column already exists in traveler_stories table');
    }
    
    // Migration 10: Create messages table
    console.log('\n📋 Creating messages table...');
    
    const messagesTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'messages'
      );
    `);
    
    if (!messagesTableCheck.rows[0].exists) {
      console.log('🔧 Creating messages table...');
      
      await client.query(`
        CREATE TABLE messages (
          id SERIAL PRIMARY KEY,
          traveller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
          sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('traveller', 'provider')),
          message_text TEXT NOT NULL,
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX idx_messages_traveller ON messages(traveller_id);
        CREATE INDEX idx_messages_provider ON messages(provider_id);
        CREATE INDEX idx_messages_service ON messages(service_id);
        CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
      `);
      
      console.log('✅ Messages table created');
    } else {
      console.log('✅ Messages table already exists');
    }
    
    // Migration 11: Add admin portal columns to services table
    console.log('\n📋 Adding admin portal columns to services table...');
    
    const adminColumns = [
      { name: 'is_featured', type: 'BOOLEAN DEFAULT false' },
      { name: 'is_trending', type: 'BOOLEAN DEFAULT false' },
      { name: 'images', type: 'TEXT[] DEFAULT \'{}\'::TEXT[]' },
      { name: 'search_priority', type: 'INTEGER DEFAULT 0' },
      { name: 'category_priority', type: 'INTEGER DEFAULT 0' },
      { name: 'is_enhanced_listing', type: 'BOOLEAN DEFAULT false' },
      { name: 'has_increased_visibility', type: 'BOOLEAN DEFAULT false' },
      { name: 'carousel_priority', type: 'INTEGER DEFAULT 0' },
      { name: 'has_maximum_visibility', type: 'BOOLEAN DEFAULT false' },
      { name: 'promotion_expires_at', type: 'TIMESTAMP' }
    ];
    
    for (const col of adminColumns) {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'services' AND column_name = $1
      `, [col.name]);
      
      if (colCheck.rows.length === 0) {
        console.log(`➕ Adding ${col.name} column...`);
        await client.query(`
          ALTER TABLE services 
          ADD COLUMN ${col.name} ${col.type}
        `);
        console.log(`✅ ${col.name} column added`);
      }
    }
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_featured ON services(is_featured) WHERE is_featured = true;
      CREATE INDEX IF NOT EXISTS idx_services_trending ON services(is_trending) WHERE is_trending = true;
      CREATE INDEX IF NOT EXISTS idx_services_search_priority ON services(search_priority DESC);
      CREATE INDEX IF NOT EXISTS idx_services_category_priority ON services(category_priority DESC);
    `);
    
    console.log('✅ Admin portal service columns added');
    
    // Migration 12: Add badge_type column to service_providers table
    console.log('\n📋 Adding badge_type column to service_providers table...');
    
    const badgeTypeCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'service_providers' AND column_name = 'badge_type'
    `);
    
    if (badgeTypeCheck.rows.length === 0) {
      console.log('➕ Adding badge_type column...');
      await client.query(`
        ALTER TABLE service_providers 
        ADD COLUMN badge_type VARCHAR(50)
      `);
      
      // Create index for badge queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_providers_badge_type ON service_providers(badge_type) WHERE badge_type IS NOT NULL
      `);
      
      console.log('✅ badge_type column added');
    } else {
      console.log('✅ badge_type column already exists');
    }
    
    // Migration 13: Fix favorites table constraints
    console.log('\n📋 Fixing favorites table constraints...');
    
    // First, create the favorites table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
          service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (
              (provider_id IS NOT NULL AND service_id IS NULL) OR 
              (provider_id IS NULL AND service_id IS NOT NULL)
          )
      )
    `);
    
    // Drop existing constraints if they exist (to avoid conflicts)
    await client.query(`
      DROP INDEX IF EXISTS favorites_user_provider_unique;
      DROP INDEX IF EXISTS favorites_user_service_unique;
    `);
    
    // Add unique constraints for provider favorites
    await client.query(`
      CREATE UNIQUE INDEX favorites_user_provider_unique 
      ON favorites (user_id, provider_id) 
      WHERE provider_id IS NOT NULL
    `);
    
    // Add unique constraints for service favorites  
    await client.query(`
      CREATE UNIQUE INDEX favorites_user_service_unique 
      ON favorites (user_id, service_id) 
      WHERE service_id IS NOT NULL
    `);
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_provider_id ON favorites(provider_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_service_id ON favorites(service_id);
    `);
    
    console.log('✅ Favorites table constraints fixed');
    
    // Migration 14: Add images column to traveler_stories table
    console.log('\n📋 Adding images column to traveler_stories table...');
    
    const imagesColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'traveler_stories' AND column_name = 'images'
    `);
    
    if (imagesColumnCheck.rows.length === 0) {
      console.log('➕ Adding images column...');
      await client.query(`
        ALTER TABLE traveler_stories 
        ADD COLUMN images TEXT DEFAULT '[]'
      `);
      
      // Update existing records to have empty array for images
      await client.query(`
        UPDATE traveler_stories 
        SET images = '[]' 
        WHERE images IS NULL
      `);
      
      console.log('✅ images column added to traveler_stories table');
    } else {
      console.log('✅ images column already exists in traveler_stories table');
    }
    
    // Migration 15: Create provider_badges table
    console.log('\n📋 Creating provider_badges table...');
    
    const providerBadgesTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'provider_badges'
      );
    `);
    
    if (!providerBadgesTableCheck.rows[0].exists) {
      console.log('🔧 Creating provider_badges table...');
      
      await client.query(`
        CREATE TABLE provider_badges (
          id SERIAL PRIMARY KEY,
          provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
          badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN ('bronze', 'silver', 'gold', 'platinum')),
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(provider_id, badge_type)
        );
        
        CREATE INDEX idx_provider_badges_provider_id ON provider_badges(provider_id);
        CREATE INDEX idx_provider_badges_badge_type ON provider_badges(badge_type);
        CREATE INDEX idx_provider_badges_active ON provider_badges(is_active) WHERE is_active = true;
      `);
      
      console.log('✅ provider_badges table created');
    } else {
      console.log('✅ provider_badges table already exists');
    }
    
  } catch (error) {
    console.error('❌ Startup migration error:', error.message);
    // Don't throw - let server continue even if migration fails
  } finally {
    client.release();
  }
}

module.exports = { runStartupMigrations };
