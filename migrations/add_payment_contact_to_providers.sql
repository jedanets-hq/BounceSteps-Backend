-- Add payment_methods and contact_info columns to service_providers table
-- These will store global payment and contact settings for all provider services

ALTER TABLE service_providers 
ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '{"bankTransfer": {"enabled": false, "bankName": "", "accountName": "", "accountNumber": "", "swiftCode": ""}}',
ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{"email": {"enabled": true, "address": ""}, "whatsapp": {"enabled": false, "number": ""}}';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_service_providers_payment_methods ON service_providers USING GIN (payment_methods);
CREATE INDEX IF NOT EXISTS idx_service_providers_contact_info ON service_providers USING GIN (contact_info);

-- Update existing providers to have default values if NULL
UPDATE service_providers 
SET payment_methods = '{"bankTransfer": {"enabled": false, "bankName": "", "accountName": "", "accountNumber": "", "swiftCode": ""}}'
WHERE payment_methods IS NULL;

UPDATE service_providers 
SET contact_info = '{"email": {"enabled": true, "address": ""}, "whatsapp": {"enabled": false, "number": ""}}'
WHERE contact_info IS NULL;
