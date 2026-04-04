-- Create service_providers table if it doesn't exist
CREATE TABLE IF NOT EXISTS service_providers (
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_providers_user_id ON service_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_region ON service_providers(region);
CREATE INDEX IF NOT EXISTS idx_service_providers_district ON service_providers(district);
CREATE INDEX IF NOT EXISTS idx_service_providers_is_active ON service_providers(is_active);