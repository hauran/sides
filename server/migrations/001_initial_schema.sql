-- Sides: Initial database schema
-- Run against Supabase PostgreSQL

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plays
CREATE TABLE plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  script_type TEXT NOT NULL CHECK (script_type IN ('pdf', 'photos')),
  script_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Script Pages
CREATE TABLE script_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  sort INTEGER NOT NULL
);

-- Characters
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (play_id, name)
);

-- Play Members
CREATE TABLE play_members (
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  PRIMARY KEY (play_id, user_id)
);

-- Scenes
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL
);

-- Lines
CREATE TABLE lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('dialogue', 'stage_direction')),
  sort INTEGER NOT NULL,
  edited BOOLEAN NOT NULL DEFAULT false
);

-- Recordings
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES users(id),
  audio_uri TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reactions
CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  emoji TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_plays_created_by ON plays(created_by);
CREATE INDEX idx_script_pages_play_id ON script_pages(play_id);
CREATE INDEX idx_characters_play_id ON characters(play_id);
CREATE INDEX idx_scenes_play_id ON scenes(play_id);
CREATE INDEX idx_lines_scene_id ON lines(scene_id);
CREATE INDEX idx_lines_character_id ON lines(character_id);
CREATE INDEX idx_recordings_line_id ON recordings(line_id);
CREATE INDEX idx_recordings_recorded_by ON recordings(recorded_by);
CREATE INDEX idx_reactions_recording_id ON reactions(recording_id);
