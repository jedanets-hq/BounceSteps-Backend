-- Add images column to traveler_stories table
ALTER TABLE traveler_stories 
ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]';

-- Update existing records to have empty array for images
UPDATE traveler_stories 
SET images = '[]' 
WHERE images IS NULL;