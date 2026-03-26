import * as ImagePicker from 'expo-image-picker';
import { API_URL, getAuthHeaders } from './api';

export async function pickAvatarImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (!result.canceled && result.assets[0]) {
    return result.assets[0].uri;
  }
  return null;
}

export async function uploadAvatarImage(uri: string): Promise<void> {
  if (!uri.startsWith('file://') && !uri.startsWith('ph://')) return;
  const formData = new FormData();
  formData.append('avatar', {
    uri,
    type: 'image/jpeg',
    name: 'avatar.jpg',
  } as any);
  await fetch(`${API_URL}/users/me/avatar`, {
    method: 'POST',
    body: formData,
    headers: getAuthHeaders(),
  });
}

export function resolveAvatarUrl(uri: string | null): string | null {
  if (!uri) return null;
  if (uri.startsWith('file://') || uri.startsWith('ph://')) return uri;
  // Server-relative paths like /api/users/:id/avatar
  if (uri.startsWith('/api/')) return `${API_URL.replace('/api', '')}${uri}`;
  return uri;
}
