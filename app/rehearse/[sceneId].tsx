import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSceneStore } from '../../src/store/useSceneStore';

export default function RehearsalScreen() {
  const { sceneId } = useLocalSearchParams<{ sceneId: string }>();
  const router = useRouter();
  const scenes = useSceneStore((s) => s.scenes);
  const scene = sceneId ? scenes[sceneId] : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {scene?.name ?? 'Rehearsal'}
        </Text>
        <Text style={styles.subtitle}>
          Scene rehearsal will be available in a future milestone.
        </Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.icon}>{'\u{1F399}\u{FE0F}'}</Text>
        <Text style={styles.placeholder}>
          The rehearsal screen will include:{'\n\n'}
          {'\u{2022}'} Scrollable script view{'\n'}
          {'\u{2022}'} Character line highlights{'\n'}
          {'\u{2022}'} AI-voiced scene partners{'\n'}
          {'\u{2022}'} Learning, Practice, and Recording modes{'\n'}
          {'\u{2022}'} Inline line editing
        </Text>
      </View>

      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  icon: {
    fontSize: 48,
    marginBottom: 20,
  },
  placeholder: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 24,
    textAlign: 'left',
    paddingHorizontal: 20,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 30,
    backgroundColor: '#534AB7',
    borderRadius: 10,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
