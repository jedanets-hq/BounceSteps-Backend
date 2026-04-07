-- Add duration_days column to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_days INTEGER;

-- Add other missing columns that might be needed
ALTER TABLE services ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS area VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS max_participants INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}'::jsonb;
