import { create } from 'zustand';
import type { Character, PlayMember, Recording, Reaction } from '../types';
import { api } from '../lib/api';

interface CastState {
  characters: Record<string, Character>;
  playMembers: PlayMember[];
  recordings: Record<string, Recording>;
  reactions: Record<string, Reaction>;
  setCharacter: (character: Character) => void;
  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  setPlayMembers: (members: PlayMember[]) => void;
  addPlayMember: (member: PlayMember) => void;
  removePlayMember: (playId: string, userId: string) => void;
  setRecording: (recording: Recording) => void;
  setRecordings: (recordings: Recording[]) => void;
  addRecording: (recording: Recording) => void;
  removeRecording: (id: string) => void;
  setReaction: (reaction: Reaction) => void;
  addReaction: (reaction: Reaction) => void;
  removeReaction: (id: string) => void;
  getCharactersForPlay: (playId: string) => Character[];
  getMembersForPlay: (playId: string) => PlayMember[];
  getRecordingsForLine: (lineId: string) => Recording[];
  fetchCast: (playId: string) => Promise<void>;
  fetchRecordings: (lineId: string) => Promise<void>;
}

export const useCastStore = create<CastState>((set, get) => ({
  characters: {},
  playMembers: [],
  recordings: {},
  reactions: {},

  setCharacter: (character) =>
    set((state) => ({
      characters: { ...state.characters, [character.id]: character },
    })),

  setCharacters: (characters) =>
    set((state) => ({
      characters: {
        ...state.characters,
        ...Object.fromEntries(characters.map((c) => [c.id, c])),
      },
    })),

  addCharacter: (character) =>
    set((state) => ({
      characters: { ...state.characters, [character.id]: character },
    })),

  updateCharacter: (id, updates) =>
    set((state) => {
      const existing = state.characters[id];
      if (!existing) return state;
      return {
        characters: { ...state.characters, [id]: { ...existing, ...updates } },
      };
    }),

  removeCharacter: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.characters;
      return { characters: rest };
    }),

  setPlayMembers: (members) => set({ playMembers: members }),

  addPlayMember: (member) =>
    set((state) => ({
      playMembers: [...state.playMembers, member],
    })),

  removePlayMember: (playId, userId) =>
    set((state) => ({
      playMembers: state.playMembers.filter(
        (m) => !(m.play_id === playId && m.user_id === userId)
      ),
    })),

  setRecording: (recording) =>
    set((state) => ({
      recordings: { ...state.recordings, [recording.id]: recording },
    })),

  setRecordings: (recordings) =>
    set((state) => ({
      recordings: {
        ...state.recordings,
        ...Object.fromEntries(recordings.map((r) => [r.id, r])),
      },
    })),

  addRecording: (recording) =>
    set((state) => ({
      recordings: { ...state.recordings, [recording.id]: recording },
    })),

  removeRecording: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.recordings;
      return { recordings: rest };
    }),

  setReaction: (reaction) =>
    set((state) => ({
      reactions: { ...state.reactions, [reaction.id]: reaction },
    })),

  addReaction: (reaction) =>
    set((state) => ({
      reactions: { ...state.reactions, [reaction.id]: reaction },
    })),

  removeReaction: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.reactions;
      return { reactions: rest };
    }),

  getCharactersForPlay: (playId) => {
    const { characters } = get();
    return Object.values(characters).filter((c) => c.play_id === playId);
  },

  getMembersForPlay: (playId) => {
    const { playMembers } = get();
    return playMembers.filter((m) => m.play_id === playId);
  },

  getRecordingsForLine: (lineId) => {
    const { recordings } = get();
    return Object.values(recordings).filter((r) => r.line_id === lineId);
  },

  fetchCast: async (playId: string) => {
    try {
      const characters = await api<Character[]>(`/plays/${playId}/characters`);
      set((state) => ({
        characters: {
          ...state.characters,
          ...Object.fromEntries(characters.map((c) => [c.id, c])),
        },
      }));
    } catch (err) {
      console.error('Failed to fetch cast:', err);
    }
  },

  fetchRecordings: async (lineId: string) => {
    try {
      const recordings = await api<Recording[]>(`/lines/${lineId}/recordings`);
      set((state) => ({
        recordings: {
          ...state.recordings,
          ...Object.fromEntries(recordings.map((r) => [r.id, r])),
        },
      }));
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
    }
  },
}));
