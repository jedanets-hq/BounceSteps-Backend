-- Add is_active column to services table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='services' AND column_name='is_active'
    ) THEN
        ALTER TABLE services ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        -- Update existing records to be active
        UPDATE services SET is_active = true WHERE is_active IS NULL;
        
        RAISE NOTICE 'Added is_active column to services table';
    ELSE
        RAISE NOTICE 'is_active column already exists in services table';
    END IF;
END $$;

-- Add is_trending column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='services' AND column_name='is_trending'
    ) THEN
        ALTER TABLE services ADD COLUMN is_trending BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_trending column to services table';
    ELSE
        RAISE NOTICE 'is_trending column already exists in services table';
    END IF;
END $$;

-- Add is_featured column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='services' AND column_name='is_featured'
    ) THEN
        ALTER TABLE services ADD COLUMN is_featured BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_featured column to services table';
    ELSE
        RAISE NOTICE 'is_featured column already exists in services table';
    END IF;
END $$;
