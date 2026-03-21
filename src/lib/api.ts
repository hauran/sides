import Constants from 'expo-constants';

const API_URL = __DEV__
  ? 'http://localhost:3001/api'
  : 'https://your-production-url.vercel.app/api';

let devUserId: string | null = null;

export function setDevUserId(id: string) {
  devUserId = id;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (__DEV__ && devUserId) {
    headers['x-dev-user-id'] = devUserId;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}
