import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayStore } from '../../src/store/usePlayStore';
import { useUserStore } from '../../src/store/useUserStore';
import { setDevUserId } from '../../src/lib/api';

const DEV_USER_ID = 'a9dfc43f-eb47-4822-8348-62b5e77af5a5';

export default function HomeScreen() {
  const router = useRouter();
  const plays = usePlayStore((s) => s.plays);
  const loading = usePlayStore((s) => s.loading);
  const fetchPlays = usePlayStore((s) => s.fetchPlays);
  const fetchCurrentUser = useUserStore((s) => s.fetchCurrentUser);

  useEffect(() => {
    setDevUserId(DEV_USER_ID);
    fetchCurrentUser().then(() => fetchPlays());
  }, []);

  const playList = Object.values(plays);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Plays</Text>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#534AB7" />
        </View>
      ) : playList.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u{1F3AD}'}</Text>
          <Text style={styles.emptyText}>
            No plays yet. Upload a script to get started!
          </Text>
        </View>
      ) : (
        <View style={styles.playList}>
          {playList.map((play) => (
            <Pressable
              key={play.id}
              style={styles.playCard}
              onPress={() => router.push(`/play/${play.id}`)}
            >
              <Text style={styles.playTitle}>{play.title}</Text>
              <Text style={styles.playMeta}>
                {play.script_type.toUpperCase()} script
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/play/new')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
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
  playList: {
    gap: 12,
  },
  playCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#534AB7',
  },
  playTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  playMeta: {
    fontSize: 13,
    color: '#888888',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#534AB7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#534AB7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 30,
  },
});
