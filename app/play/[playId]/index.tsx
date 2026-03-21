import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayStore } from '../../../src/store/usePlayStore';
import { useSceneStore } from '../../../src/store/useSceneStore';
import { useCastStore } from '../../../src/store/useCastStore';

export default function PlayDetailScreen() {
  const { playId } = useLocalSearchParams<{ playId: string }>();
  const router = useRouter();
  const play = usePlayStore((s) => (playId ? s.plays[playId] : undefined));
  const getScenesForPlay = useSceneStore((s) => s.getScenesForPlay);
  const getCharactersForPlay = useCastStore((s) => s.getCharactersForPlay);

  const scenes = playId ? getScenesForPlay(playId) : [];
  const characters = playId ? getCharactersForPlay(playId) : [];

  if (!play) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Play not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{play.title}</Text>
      <Text style={styles.meta}>
        {play.script_type.toUpperCase()} script
      </Text>

      <Text style={styles.sectionTitle}>Characters</Text>
      {characters.length === 0 ? (
        <Text style={styles.emptyText}>
          No characters parsed yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {characters.map((c) => (
            <View key={c.id} style={styles.characterRow}>
              <Text style={styles.characterName}>{c.name}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Scenes</Text>
      {scenes.length === 0 ? (
        <Text style={styles.emptyText}>
          No scenes parsed yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {scenes.map((scene) => (
            <Pressable
              key={scene.id}
              style={styles.sceneCard}
              onPress={() => router.push(`/rehearse/${scene.id}`)}
            >
              <Text style={styles.sceneName}>{scene.name}</Text>
              <Text style={styles.sceneArrow}>{'\u{203A}'}</Text>
            </Pressable>
          ))}
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
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#534AB7',
    marginBottom: 12,
    marginTop: 8,
  },
  list: {
    gap: 8,
    marginBottom: 20,
  },
  characterRow: {
    backgroundColor: '#EEEDFE',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  characterName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A2E',
  },
  sceneCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sceneName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A2E',
    flex: 1,
  },
  sceneArrow: {
    fontSize: 22,
    color: '#534AB7',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 17,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 40,
  },
});
