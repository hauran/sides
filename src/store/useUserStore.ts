import { create } from 'zustand';
import type { User } from '../types';

interface UserState {
  currentUser: User | null;
  users: Record<string, User>;
  setCurrentUser: (user: User | null) => void;
  setUser: (user: User) => void;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  removeUser: (id: string) => void;
  fetchCurrentUser: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  users: {},

  setCurrentUser: (user) => set({ currentUser: user }),

  setUser: (user) =>
    set((state) => ({
      users: { ...state.users, [user.id]: user },
    })),

  addUser: (user) =>
    set((state) => ({
      users: { ...state.users, [user.id]: user },
    })),

  updateUser: (id, updates) =>
    set((state) => {
      const existing = state.users[id];
      if (!existing) return state;
      const updated = { ...existing, ...updates };
      return {
        users: { ...state.users, [id]: updated },
        currentUser:
          state.currentUser?.id === id ? updated : state.currentUser,
      };
    }),

  removeUser: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.users;
      return {
        users: rest,
        currentUser: state.currentUser?.id === id ? null : state.currentUser,
      };
    }),

  fetchCurrentUser: async () => {
    // TODO: Fetch from API
  },
}));
