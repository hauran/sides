import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="play/new" />
        <Stack.Screen name="play/[playId]/index" />
        <Stack.Screen name="play/[playId]/edit" />
        <Stack.Screen name="rehearse/[sceneId]" />
      </Stack>
    </>
  );
}
