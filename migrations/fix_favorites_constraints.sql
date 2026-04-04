-- Fix favorites table constraints
-- Add unique constraints to prevent duplicate favorites

-- First, create the favorites table if it doesn't exist
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
);

-- Add unique constraints to prevent duplicate favorites
-- Drop existing constraints if they exist (to avoid conflicts)
DO $
BEGIN
    -- Drop existing unique constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'favorites_user_provider_unique' 
               AND table_name = 'favorites') THEN
        ALTER TABLE favorites DROP CONSTRAINT favorites_user_provider_unique;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'favorites_user_service_unique' 
               AND table_name = 'favorites') THEN
        ALTER TABLE favorites DROP CONSTRAINT favorites_user_service_unique;
    END IF;
END $;

-- Add unique constraints for provider favorites
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_provider_unique 
ON favorites (user_id, provider_id) 
WHERE provider_id IS NOT NULL;

-- Add unique constraints for service favorites  
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_service_unique 
ON favorites (user_id, service_id) 
WHERE service_id IS NOT NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_provider_id ON favorites(provider_id);
CREATE INDEX IF NOT EXISTS idx_favorites_service_id ON favorites(service_id);