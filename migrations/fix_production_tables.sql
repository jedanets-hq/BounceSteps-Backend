-- Fix production database tables for provider_followers and favorites
-- This migration ensures the tables exist with correct schema

-- 1. Fix provider_followers table
DROP TABLE IF EXISTS provider_followers CASCADE;
CREATE TABLE provider_followers (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT provider_followers_unique UNIQUE(provider_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_followers_provider ON provider_followers(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_followers_user ON provider_followers(user_id);

-- 2. Fix favorites table
DROP TABLE IF EXISTS favorites CASCADE;
CREATE TABLE favorites (
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
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_provider ON favorites(provider_id);
CREATE INDEX IF NOT EXISTS idx_favorites_service ON favorites(service_id);

-- Success message
SELECT 'Migration completed successfully' as status;
