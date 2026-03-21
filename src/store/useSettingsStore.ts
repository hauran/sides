import { create } from 'zustand';

interface SettingsState {
  displayName: string;
  setDisplayName: (name: string) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  displayName: '',

  setDisplayName: (name) => set({ displayName: name }),

  loadSettings: async () => {
    // TODO: Load from AsyncStorage
  },

  saveSettings: async () => {
    // TODO: Persist to AsyncStorage
    const { displayName } = get();
    console.log('Settings saved:', { displayName });
  },
}));
