import { View, Text, StyleSheet } from 'react-native';
import { usePlayStore } from '../../src/store/usePlayStore';
import { useSceneStore } from '../../src/store/useSceneStore';

export default function LibraryScreen() {
  const currentPlayId = usePlayStore((s) => s.currentPlayId);
  const plays = usePlayStore((s) => s.plays);
  const getScenesForPlay = useSceneStore((s) => s.getScenesForPlay);

  const currentPlay = currentPlayId ? plays[currentPlayId] : null;
  const scenes = currentPlayId ? getScenesForPlay(currentPlayId) : [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Library</Text>

      {!currentPlay ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u{1F4DA}'}</Text>
          <Text style={styles.emptyText}>
            Select a play to see its scenes
          </Text>
        </View>
      ) : (
        <View>
          <Text style={styles.playTitle}>{currentPlay.title}</Text>
          {scenes.length === 0 ? (
            <Text style={styles.noScenes}>No scenes parsed yet.</Text>
          ) : (
            <View style={styles.sceneList}>
              {scenes.map((scene) => (
                <View key={scene.id} style={styles.sceneCard}>
                  <Text style={styles.sceneName}>{scene.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 17,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 40,
  },
  playTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#534AB7',
    marginBottom: 16,
  },
  noScenes: {
    fontSize: 15,
    color: '#999999',
    fontStyle: 'italic',
  },
  sceneList: {
    gap: 10,
  },
  sceneCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    padding: 14,
  },
  sceneName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A2E',
  },
});
