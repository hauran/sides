import { create } from 'zustand';
import type { Scene, Line } from '../types';

interface SceneState {
  scenes: Record<string, Scene>;
  lines: Record<string, Line>;
  setScene: (scene: Scene) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  removeScene: (id: string) => void;
  setLine: (line: Line) => void;
  setLines: (lines: Line[]) => void;
  addLine: (line: Line) => void;
  updateLine: (id: string, updates: Partial<Line>) => void;
  removeLine: (id: string) => void;
  getScenesForPlay: (playId: string) => Scene[];
  getLinesForScene: (sceneId: string) => Line[];
  fetchScenes: (playId: string) => Promise<void>;
  fetchLines: (sceneId: string) => Promise<void>;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: {},
  lines: {},

  setScene: (scene) =>
    set((state) => ({
      scenes: { ...state.scenes, [scene.id]: scene },
    })),

  setScenes: (scenes) =>
    set((state) => ({
      scenes: {
        ...state.scenes,
        ...Object.fromEntries(scenes.map((s) => [s.id, s])),
      },
    })),

  addScene: (scene) =>
    set((state) => ({
      scenes: { ...state.scenes, [scene.id]: scene },
    })),

  updateScene: (id, updates) =>
    set((state) => {
      const existing = state.scenes[id];
      if (!existing) return state;
      return {
        scenes: { ...state.scenes, [id]: { ...existing, ...updates } },
      };
    }),

  removeScene: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.scenes;
      return { scenes: rest };
    }),

  setLine: (line) =>
    set((state) => ({
      lines: { ...state.lines, [line.id]: line },
    })),

  setLines: (lines) =>
    set((state) => ({
      lines: {
        ...state.lines,
        ...Object.fromEntries(lines.map((l) => [l.id, l])),
      },
    })),

  addLine: (line) =>
    set((state) => ({
      lines: { ...state.lines, [line.id]: line },
    })),

  updateLine: (id, updates) =>
    set((state) => {
      const existing = state.lines[id];
      if (!existing) return state;
      return {
        lines: { ...state.lines, [id]: { ...existing, ...updates } },
      };
    }),

  removeLine: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.lines;
      return { lines: rest };
    }),

  getScenesForPlay: (playId) => {
    const { scenes } = get();
    return Object.values(scenes)
      .filter((s) => s.play_id === playId)
      .sort((a, b) => a.sort - b.sort);
  },

  getLinesForScene: (sceneId) => {
    const { lines } = get();
    return Object.values(lines)
      .filter((l) => l.scene_id === sceneId)
      .sort((a, b) => a.sort - b.sort);
  },

  fetchScenes: async (_playId: string) => {
    // TODO: Fetch from API
  },

  fetchLines: async (_sceneId: string) => {
    // TODO: Fetch from API
  },
}));
