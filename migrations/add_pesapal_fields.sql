-- Add PesaPal fields to payments table

-- Add PesaPal tracking columns
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS pesapal_tracking_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS pesapal_merchant_reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS pesapal_payment_status VARCHAR(100),
ADD COLUMN IF NOT EXISTS pesapal_confirmation_code VARCHAR(255),
ADD COLUMN IF NOT EXISTS booking_ids JSONB DEFAULT '[]';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_pesapal_tracking ON payments(pesapal_tracking_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_ref ON payments(pesapal_merchant_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Update bookings table to track payment status
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

-- Create payments table if it doesn't exist
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reference VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    pesapal_tracking_id VARCHAR(255),
    pesapal_merchant_reference VARCHAR(255),
    pesapal_payment_status VARCHAR(100),
    pesapal_confirmation_code VARCHAR(255),
    booking_ids JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
