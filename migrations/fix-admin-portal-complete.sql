-- Complete fix for admin portal issues
-- This migration adds all missing tables and columns needed for the admin portal

-- 1. Create services table if it doesn't exist
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(10,2),
    duration VARCHAR(100),
    location TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'rejected', 'inactive')),
    is_featured BOOLEAN DEFAULT false,
    is_trending BOOLEAN DEFAULT false,
    images JSONB DEFAULT '[]'::jsonb,
    total_bookings INTEGER DEFAULT 0,
    total_favorites INTEGER DEFAULT 0,
    search_priority INTEGER DEFAULT 0,
    category_priority INTEGER DEFAULT 0,
    is_enhanced_listing BOOLEAN DEFAULT false,
    has_increased_visibility BOOLEAN DEFAULT false,
    carousel_priority INTEGER DEFAULT 0,
    has_maximum_visibility BOOLEAN DEFAULT false,
    promotion_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add missing columns to services table if they don't exist
DO $$ 
BEGIN
    -- Add is_featured column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_featured') THEN
        ALTER TABLE services ADD COLUMN is_featured BOOLEAN DEFAULT false;
    END IF;
    
    -- Add is_trending column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_trending') THEN
        ALTER TABLE services ADD COLUMN is_trending BOOLEAN DEFAULT false;
    END IF;
    
    -- Add images column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='images') THEN
        ALTER TABLE services ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- Add total_bookings column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='total_bookings') THEN
        ALTER TABLE services ADD COLUMN total_bookings INTEGER DEFAULT 0;
    END IF;
    
    -- Add total_favorites column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='total_favorites') THEN
        ALTER TABLE services ADD COLUMN total_favorites INTEGER DEFAULT 0;
    END IF;
    
    -- Add promotion columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='search_priority') THEN
        ALTER TABLE services ADD COLUMN search_priority INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='category_priority') THEN
        ALTER TABLE services ADD COLUMN category_priority INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_enhanced_listing') THEN
        ALTER TABLE services ADD COLUMN is_enhanced_listing BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='has_increased_visibility') THEN
        ALTER TABLE services ADD COLUMN has_increased_visibility BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='carousel_priority') THEN
        ALTER TABLE services ADD COLUMN carousel_priority INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='has_maximum_visibility') THEN
        ALTER TABLE services ADD COLUMN has_maximum_visibility BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='promotion_expires_at') THEN
        ALTER TABLE services ADD COLUMN promotion_expires_at TIMESTAMP;
    END IF;
END $$;

-- 3. Create traveler_stories table
CREATE TABLE IF NOT EXISTS traveler_stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    location VARCHAR(255),
    trip_date DATE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    likes_count INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create favorites table if it doesn't exist
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, service_id)
);

-- 5. Create provider_badges table
CREATE TABLE IF NOT EXISTS provider_badges (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
    badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN ('verified', 'premium', 'top_rated', 'eco_friendly', 'local_expert')),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE(provider_id) -- Only one badge per provider
);

-- 6. Add badge_type column to service_providers for easy access
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_providers' AND column_name='badge_type') THEN
        ALTER TABLE service_providers ADD COLUMN badge_type VARCHAR(50);
    END IF;
END $$;

-- 7. Create reviews table for ratings
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create promotion_payments table for financial tracking
CREATE TABLE IF NOT EXISTS promotion_payments (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method VARCHAR(50),
    transaction_reference VARCHAR(255),
    payment_type VARCHAR(50) DEFAULT 'service_promotion',
    description TEXT,
    duration_days INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_services_provider_id ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_is_featured ON services(is_featured);
CREATE INDEX IF NOT EXISTS idx_services_is_trending ON services(is_trending);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_traveler_stories_user_id ON traveler_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_traveler_stories_status ON traveler_stories(status);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_service_id ON favorites(service_id);
CREATE INDEX IF NOT EXISTS idx_provider_badges_provider_id ON provider_badges(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_service_id ON reviews(service_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_promotion_payments_provider_id ON promotion_payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_promotion_payments_status ON promotion_payments(status);

-- 10. Insert sample data for testing
INSERT INTO services (provider_id, title, description, category, price, duration, location, status, is_featured, is_trending, images, total_bookings, total_favorites)
SELECT 
    sp.id,
    CASE 
        WHEN sp.business_type = 'Tour Operator' THEN sp.business_name || ' Safari Experience'
        WHEN sp.business_type = 'Adventure Sports' THEN sp.business_name || ' Adventure Package'
        ELSE sp.business_name || ' Service Package'
    END,
    'Premium ' || LOWER(sp.business_type) || ' experience with ' || sp.business_name,
    CASE 
        WHEN sp.business_type = 'Tour Operator' THEN 'Wildlife Safari'
        WHEN sp.business_type = 'Adventure Sports' THEN 'Mountain Trekking'
        ELSE 'Cultural Tours'
    END,
    CASE 
        WHEN sp.business_type = 'Tour Operator' THEN 850.00
        WHEN sp.business_type = 'Adventure Sports' THEN 1200.00
        ELSE 450.00
    END,
    '3 days',
    COALESCE(sp.service_location, sp.location, 'Tanzania'),
    'active',
    (RANDOM() > 0.7),
    (RANDOM() > 0.8),
    '["https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400", "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400"]'::jsonb,
    FLOOR(RANDOM() * 50)::INTEGER,
    FLOOR(RANDOM() * 20)::INTEGER
FROM service_providers sp
WHERE NOT EXISTS (SELECT 1 FROM services WHERE provider_id = sp.id)
LIMIT 10;

-- 11. Insert sample traveler stories
INSERT INTO traveler_stories (user_id, title, content, location, trip_date, status, likes_count)
SELECT 
    u.id,
    'Amazing Experience in ' || COALESCE(sp.service_location, 'Tanzania'),
    'I had an incredible time exploring the beautiful landscapes and experiencing the local culture. The service was exceptional and I would highly recommend this to other travelers.',
    COALESCE(sp.service_location, sp.location, 'Tanzania'),
    CURRENT_DATE - INTERVAL '30 days' + (RANDOM() * INTERVAL '25 days'),
    CASE 
        WHEN RANDOM() > 0.7 THEN 'approved'
        WHEN RANDOM() > 0.3 THEN 'pending'
        ELSE 'rejected'
    END,
    FLOOR(RANDOM() * 50)::INTEGER
FROM users u
LEFT JOIN service_providers sp ON u.id = sp.user_id
WHERE u.user_type = 'traveler'
AND NOT EXISTS (SELECT 1 FROM traveler_stories WHERE user_id = u.id)
LIMIT 5;

-- 12. Update service_providers with badge information
UPDATE service_providers 
SET badge_type = CASE 
    WHEN is_verified = true AND rating >= 4.5 THEN 'verified'
    WHEN rating >= 4.8 THEN 'top_rated'
    WHEN total_bookings > 100 THEN 'premium'
    ELSE NULL
END
WHERE badge_type IS NULL;

-- 13. Insert corresponding badge records
INSERT INTO provider_badges (provider_id, badge_type, notes)
SELECT 
    id, 
    badge_type,
    'Auto-assigned based on performance metrics'
FROM service_providers 
WHERE badge_type IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM provider_badges WHERE provider_id = service_providers.id);

-- 14. Update counters and statistics
UPDATE services SET 
    total_bookings = (
        SELECT COUNT(*) 
        FROM bookings 
        WHERE bookings.provider_id = services.provider_id 
        AND bookings.status IN ('confirmed', 'completed')
    ),
    total_favorites = (
        SELECT COUNT(*) 
        FROM favorites 
        WHERE favorites.service_id = services.id
    );

UPDATE service_providers SET 
    total_bookings = (
        SELECT COUNT(*) 
        FROM bookings 
        WHERE bookings.provider_id = service_providers.id 
        AND bookings.status IN ('confirmed', 'completed')
    ),
    rating = (
        SELECT COALESCE(AVG(rating), 0) 
        FROM reviews 
        WHERE reviews.provider_id = service_providers.id
    );

-- 15. Create trigger to update counters automatically
CREATE OR REPLACE FUNCTION update_service_counters()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total_bookings for services
    UPDATE services SET 
        total_bookings = (
            SELECT COUNT(*) 
            FROM bookings 
            WHERE bookings.provider_id = services.provider_id 
            AND bookings.status IN ('confirmed', 'completed')
        )
    WHERE provider_id = COALESCE(NEW.provider_id, OLD.provider_id);
    
    -- Update total_favorites for services
    IF TG_TABLE_NAME = 'favorites' THEN
        UPDATE services SET 
            total_favorites = (
                SELECT COUNT(*) 
                FROM favorites 
                WHERE favorites.service_id = services.id
            )
        WHERE id = COALESCE(NEW.service_id, OLD.service_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_booking_counters ON bookings;
CREATE TRIGGER trigger_update_booking_counters
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_service_counters();

DROP TRIGGER IF EXISTS trigger_update_favorite_counters ON favorites;
CREATE TRIGGER trigger_update_favorite_counters
    AFTER INSERT OR DELETE ON favorites
    FOR EACH ROW EXECUTE FUNCTION update_service_counters();

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Admin portal database schema has been successfully updated!';
    RAISE NOTICE '📊 Tables created/updated: services, traveler_stories, favorites, provider_badges, reviews, promotion_payments';
    RAISE NOTICE '🔧 Added missing columns for featured/trending services, images, and promotion settings';
    RAISE NOTICE '📈 Sample data inserted for testing';
    RAISE NOTICE '⚡ Performance indexes and triggers created';
END $$;