-- Add file support columns to discussion_replies table
ALTER TABLE discussion_replies 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50);

-- Add file support columns to discussions table (for initial posts with files)
ALTER TABLE discussions
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50);

-- Create index for faster file queries
CREATE INDEX IF NOT EXISTS idx_discussion_replies_file ON discussion_replies(file_url) WHERE file_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussions_file ON discussions(file_url) WHERE file_url IS NOT NULL;
