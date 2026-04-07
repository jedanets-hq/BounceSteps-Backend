-- Add missing columns to services table for provider service creation
-- This fixes the "Failed to create service" error in production

-- Add columns if they don't exist
DO $$ 
BEGIN
    -- Add max_participants column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='max_participants') THEN
        ALTER TABLE services ADD COLUMN max_participants INTEGER;
        RAISE NOTICE 'Added max_participants column';
    END IF;
    
    -- Add region column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='region') THEN
        ALTER TABLE services ADD COLUMN region VARCHAR(100);
        RAISE NOTICE 'Added region column';
    END IF;
    
    -- Add district column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='district') THEN
        ALTER TABLE services ADD COLUMN district VARCHAR(100);
        RAISE NOTICE 'Added district column';
    END IF;
    
    -- Add area column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='area') THEN
        ALTER TABLE services ADD COLUMN area VARCHAR(100);
        RAISE NOTICE 'Added area column';
    END IF;
    
    -- Add country column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='country') THEN
        ALTER TABLE services ADD COLUMN country VARCHAR(100) DEFAULT 'Tanzania';
        RAISE NOTICE 'Added country column';
    END IF;
    
    -- Add amenities column (JSONB for flexible storage)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='amenities') THEN
        ALTER TABLE services ADD COLUMN amenities JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added amenities column';
    END IF;
    
    -- Add payment_methods column (JSONB for flexible storage)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='payment_methods') THEN
        ALTER TABLE services ADD COLUMN payment_methods JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added payment_methods column';
    END IF;
    
    -- Add contact_info column (JSONB for flexible storage)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='contact_info') THEN
        ALTER TABLE services ADD COLUMN contact_info JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added contact_info column';
    END IF;
    
    -- Add is_active column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='is_active') THEN
        ALTER TABLE services ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column';
    END IF;
    
    -- Add average_rating column (for display purposes)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='services' AND column_name='average_rating') THEN
        ALTER TABLE services ADD COLUMN average_rating DECIMAL(3,2) DEFAULT 0.0;
        RAISE NOTICE 'Added average_rating column';
    END IF;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;

-- Create index on location fields for better query performance
CREATE INDEX IF NOT EXISTS idx_services_region ON services(region);
CREATE INDEX IF NOT EXISTS idx_services_district ON services(district);
CREATE INDEX IF NOT EXISTS idx_services_area ON services(area);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);

-- Display current services table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'services'
ORDER BY ordinal_position;
