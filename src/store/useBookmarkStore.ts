import { create } from 'zustand';
import type { Bookmark } from '../types';
import { api } from '../lib/api';

interface BookmarkState {
  bookmarks: Record<string, Bookmark>; // keyed by line_id
  fetchBookmarks: (playId: string) => Promise<void>;
  addBookmark: (lineId: string) => Promise<void>;
  removeBookmark: (lineId: string) => Promise<void>;
  isBookmarked: (lineId: string) => boolean;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: {},

  fetchBookmarks: async (playId: string) => {
    try {
      const bookmarks = await api<Bookmark[]>(`/plays/${playId}/bookmarks`);
      set({
        bookmarks: Object.fromEntries(bookmarks.map((b) => [b.line_id, b])),
      });
    } catch (err) {
      console.error('Failed to fetch bookmarks:', err);
    }
  },

  addBookmark: async (lineId: string) => {
    try {
      const bookmark = await api<Bookmark>('/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ line_id: lineId }),
      });
      set((state) => ({
        bookmarks: { ...state.bookmarks, [lineId]: bookmark },
      }));
    } catch (err) {
      console.error('Failed to add bookmark:', err);
    }
  },

  removeBookmark: async (lineId: string) => {
    try {
      await api(`/bookmarks/${lineId}`, { method: 'DELETE' });
      set((state) => {
        const { [lineId]: _, ...rest } = state.bookmarks;
        return { bookmarks: rest };
      });
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  },

  isBookmarked: (lineId: string) => {
    return lineId in get().bookmarks;
  },
}));
