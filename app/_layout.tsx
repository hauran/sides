import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore, useIsAuthenticated } from '../src/store/useAuthStore';
import { setAuthToken, setDevUserId, DEV_USER_ID } from '../src/lib/api';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthStore((s) => s.isLoading);
  const token = useAuthStore((s) => s.token);
  const restore = useAuthStore((s) => s.restore);
  const pendingInviteToken = useAuthStore((s) => s.pendingInviteToken);
  const setPendingInviteToken = useAuthStore((s) => s.setPendingInviteToken);

  useEffect(() => {
    restore();
  }, []);

  useEffect(() => {
    if (token) {
      setAuthToken(token);
    } else if (__DEV__) {
      setDevUserId(DEV_USER_ID);
    }
  }, [token]);

  // Auth-gated routing
  useEffect(() => {
    if (isLoading) return;

    const onLoginScreen = segments[0] === 'login';
    const onInviteScreen = segments[0] === 'invite';

    if (!isAuthenticated && !onLoginScreen && !onInviteScreen) {
      router.replace('/login');
    } else if (isAuthenticated && onLoginScreen) {
      // Just logged in — check for pending invite
      if (pendingInviteToken) {
        const inviteToken = pendingInviteToken;
        setPendingInviteToken(null);
        router.replace(`/invite/${inviteToken}`);
      } else {
        router.replace('/');
      }
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.rose} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="play/new" />
        <Stack.Screen name="play/[playId]/index" />
        <Stack.Screen name="play/[playId]/edit" />
        <Stack.Screen name="rehearse/[sceneId]" />
        <Stack.Screen name="invite/[token]" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});
