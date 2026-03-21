import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#EEEDFE',
          },
          headerTintColor: '#534AB7',
          headerTitleStyle: {
            fontWeight: '700',
          },
          contentStyle: {
            backgroundColor: '#FFFFFF',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="play/new"
          options={{ title: 'New Play', presentation: 'modal' }}
        />
        <Stack.Screen
          name="play/[playId]/index"
          options={{ title: 'Play Details' }}
        />
        <Stack.Screen
          name="rehearse/[sceneId]"
          options={{ title: 'Rehearse', presentation: 'fullScreenModal' }}
        />
      </Stack>
    </>
  );
}
