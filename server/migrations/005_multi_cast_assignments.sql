-- Allow multiple users per character (multiple casts)
-- Change PK from (character_id) to (character_id, user_id)
ALTER TABLE character_assignments DROP CONSTRAINT character_assignments_pkey;
ALTER TABLE character_assignments ADD PRIMARY KEY (character_id, user_id);
