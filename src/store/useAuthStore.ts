import { create } from 'zustand';
import { API_URL } from '../lib/api';

// TODO: Switch to expo-secure-store after next native rebuild for token persistence

interface AuthState {
  token: string | null;
  isLoading: boolean;

  restore: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string, name?: string) => Promise<{ needsName: boolean } | { user: any; token: string }>;
  googleAuth: (idToken: string, name?: string) => Promise<{ user: any; token: string }>;
  setSession: (token: string) => Promise<void>;
  logout: () => Promise<void>;

  pendingInviteToken: string | null;
  setPendingInviteToken: (token: string | null) => void;
}

// Derive isAuthenticated outside the store to avoid redundant state
export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  isLoading: true,
  pendingInviteToken: null,

  restore: async () => {
    set({ token: null, isLoading: false });
  },

  sendCode: async (email: string) => {
    const res = await fetch(`${API_URL}/auth/email/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to send code');
    }
  },

  verifyCode: async (email: string, code: string, name?: string) => {
    const res = await fetch(`${API_URL}/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, name }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (body.needs_name) {
        return { needsName: true };
      }
      throw new Error(body.error || 'Verification failed');
    }
    await get().setSession(body.token);
    return { user: body.user, token: body.token };
  },

  googleAuth: async (idToken: string, name?: string) => {
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken, name }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Google auth failed');
    }
    await get().setSession(body.token);
    return { user: body.user, token: body.token };
  },

  setSession: async (token: string) => {
    set({ token });
  },

  logout: async () => {
    set({ token: null });
  },

  setPendingInviteToken: (token) => set({ pendingInviteToken: token }),
}));

// Derived selector — use instead of storing isAuthenticated separately
export const useIsAuthenticated = () => useAuthStore((s) => s.token !== null);
