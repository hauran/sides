import { create } from 'zustand';

interface SettingsState {
  displayName: string;
  elevenLabsApiKey: string;
  setDisplayName: (name: string) => void;
  setElevenLabsApiKey: (key: string) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  displayName: '',
  elevenLabsApiKey: '',

  setDisplayName: (name) => set({ displayName: name }),

  setElevenLabsApiKey: (key) => set({ elevenLabsApiKey: key }),

  loadSettings: async () => {
    // TODO: Load from AsyncStorage or SecureStore
  },

  saveSettings: async () => {
    // TODO: Persist to AsyncStorage or SecureStore
    const { displayName, elevenLabsApiKey } = get();
    console.log('Settings saved:', { displayName, hasApiKey: !!elevenLabsApiKey });
  },
}));
