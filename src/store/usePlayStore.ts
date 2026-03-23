import { create } from 'zustand';
import type { Play } from '../types';
import { api } from '../lib/api';

interface PlayState {
  plays: Record<string, Play>;
  currentPlayId: string | null;
  loading: boolean;
  setCurrentPlayId: (id: string | null) => void;
  setPlay: (play: Play) => void;
  setPlays: (plays: Play[]) => void;
  addPlay: (play: Play) => void;
  updatePlay: (id: string, updates: Partial<Play>) => void;
  removePlay: (id: string) => void;
  fetchPlays: () => Promise<void>;
}

export const usePlayStore = create<PlayState>((set, get) => ({
  plays: {},
  currentPlayId: null,
  loading: false,

  setCurrentPlayId: (id) => set({ currentPlayId: id }),

  setPlay: (play) =>
    set((state) => ({
      plays: { ...state.plays, [play.id]: play },
    })),

  setPlays: (plays) =>
    set({
      plays: Object.fromEntries(plays.map((p) => [p.id, p])),
    }),

  addPlay: (play) =>
    set((state) => ({
      plays: { ...state.plays, [play.id]: play },
    })),

  updatePlay: (id, updates) =>
    set((state) => {
      const existing = state.plays[id];
      if (!existing) return state;
      return {
        plays: { ...state.plays, [id]: { ...existing, ...updates } },
      };
    }),

  removePlay: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.plays;
      return {
        plays: rest,
        currentPlayId: state.currentPlayId === id ? null : state.currentPlayId,
      };
    }),

  fetchPlays: async () => {
    const hasPlays = Object.keys(get().plays).length > 0;
    if (!hasPlays) set({ loading: true });
    try {
      const plays = await api<Play[]>('/plays');
      // Skip state update if nothing changed (avoids unnecessary re-renders during polling)
      const current = get().plays;
      const fingerprint = (p: Play) => `${p.id}:${p.status ?? ''}:${p.progress ?? ''}`;
      const currentKeys = Object.values(current).map(fingerprint).sort().join('|');
      const incomingKeys = plays.map(fingerprint).sort().join('|');
      if (currentKeys === incomingKeys && hasPlays) {
        set({ loading: false });
        return;
      }
      set({
        plays: Object.fromEntries(plays.map((p) => [p.id, p])),
        loading: false,
      });
    } catch (err) {
      console.error('Failed to fetch plays:', err);
      set({ loading: false });
    }
  },
}));
