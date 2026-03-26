-- Add support for multiple speakers per line
-- character_ids stores an array of character UUIDs
-- character_id is kept for backwards compatibility but character_ids is the source of truth

ALTER TABLE lines ADD COLUMN character_ids UUID[] DEFAULT '{}';

-- Migrate existing data: copy character_id into character_ids array
UPDATE lines SET character_ids = ARRAY[character_id] WHERE character_id IS NOT NULL;

-- Add index for array containment queries (find lines by character)
CREATE INDEX idx_lines_character_ids ON lines USING GIN (character_ids);
