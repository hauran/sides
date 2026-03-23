import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { API_URL, devUserId } from './api';

export function getTtsUrl(text: string, character: string): string {
  const params = new URLSearchParams({ text, character });
  if (__DEV__ && devUserId) {
    params.set('_dev_user_id', devUserId);
  }
  return `${API_URL}/tts?${params.toString()}`;
}

export function createLineSpeaker(text: string, character: string): AudioPlayer {
  const url = getTtsUrl(text, character);
  return createAudioPlayer(url);
}
