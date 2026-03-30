-- Add missing is_trending column to services table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_trending') THEN
        ALTER TABLE services ADD COLUMN is_trending BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add missing service_id column to favorites table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='favorites' AND column_name='service_id') THEN
        ALTER TABLE favorites ADD COLUMN service_id INTEGER REFERENCES services(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create missing provider_followers table
CREATE TABLE IF NOT EXISTS provider_followers (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
    follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, follower_id)
);

-- Create missing provider_badges table
CREATE TABLE IF NOT EXISTS provider_badges (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
    badge_type VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);
