import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { API_URL, getAuthHeaders } from './api';

export function getTtsUrl(text: string, character: string): string {
  const params = new URLSearchParams({ text, character });
  // For audio URLs we need auth as query param since we can't set headers
  const headers = getAuthHeaders();
  if (headers['Authorization']) {
    params.set('_bearer', headers['Authorization'].slice(7));
  } else if (headers['x-dev-user-id']) {
    params.set('_dev_user_id', headers['x-dev-user-id']);
  }
  return `${API_URL}/tts?${params.toString()}`;
}

export function createLineSpeaker(text: string, character: string): AudioPlayer {
  const url = getTtsUrl(text, character);
  return createAudioPlayer(url);
}
