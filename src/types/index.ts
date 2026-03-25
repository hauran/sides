export interface User {
  id: string;
  email: string;
  name: string;
  avatar_uri: string | null;
  created_at: string;
}

export interface Play {
  id: string;
  title: string;
  created_by: string; // FK -> User
  script_type: 'pdf' | 'photos';
  script_uri: string | null;
  status: 'processing' | 'ready' | 'failed';
  progress: string | null;
  cover_uri: string | null;
  created_at: string;
}

export interface ScriptPage {
  id: string;
  play_id: string;
  uri: string;
  sort: number;
}

export interface Character {
  id: string;
  play_id: string;
  name: string;
}

export interface PlayMember {
  play_id: string;
  user_id: string;
}

export interface CharacterAssignment {
  character_id: string;
  user_id: string;
}

export interface Scene {
  id: string;
  play_id: string;
  name: string;
  sort: number;
}

export interface Line {
  id: string;
  scene_id: string;
  character_id: string | null;
  character_name?: string | null;
  text: string;
  type: 'dialogue' | 'stage_direction';
  sort: number;
  edited: boolean;
}

export interface Recording {
  id: string;
  line_id: string;
  recorded_by: string;
  audio_uri: string;
  recorded_at: string;
}

export interface Reaction {
  id: string;
  recording_id: string;
  user_id: string;
  emoji: string | null;
  note: string | null;
  created_at: string;
}
