-- Milestone 7: Bookmarks and hidden/skip lines

CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(line_id, user_id)
);

ALTER TABLE lines ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;
