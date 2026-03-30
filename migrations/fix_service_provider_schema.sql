-- Fix service_providers table schema
-- Add missing columns to match models/index.js and routes/auth.js

-- 1. Rename column if it exists and has same purpose
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_providers' AND column_name = 'business_description') THEN
        ALTER TABLE service_providers RENAME COLUMN business_description TO description;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_providers' AND column_name = 'business_address') THEN
        ALTER TABLE service_providers RENAME COLUMN business_address TO location;
    END IF;
END $$;

-- 2. Add missing columns
ALTER TABLE service_providers 
ADD COLUMN IF NOT EXISTS business_type VARCHAR(255) DEFAULT 'General Services',
ADD COLUMN IF NOT EXISTS service_location TEXT,
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Tanzania',
ADD COLUMN IF NOT EXISTS region VARCHAR(100),
ADD COLUMN IF NOT EXISTS district VARCHAR(100),
ADD COLUMN IF NOT EXISTS area VARCHAR(255),
ADD COLUMN IF NOT EXISTS ward VARCHAR(100),
ADD COLUMN IF NOT EXISTS location_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS service_categories JSONB DEFAULT '[]';

-- 3. Sync existing data if possible
UPDATE service_providers SET service_location = location WHERE service_location IS NULL;

-- 4. Create missing tables if they don't exist
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    traveller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id INTEGER, -- Optional, can be NULL
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('traveller', 'provider')),
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_traveller ON messages(traveller_id);
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider_id);
