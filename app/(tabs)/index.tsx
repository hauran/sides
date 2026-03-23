import { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { usePlayStore } from '../../src/store/usePlayStore';
import { useUserStore } from '../../src/store/useUserStore';
import { DEV_USER_ID, setDevUserId } from '../../src/lib/api';
const POLL_INTERVAL = 5000;

export default function HomeScreen() {
  const router = useRouter();
  const plays = usePlayStore((s) => s.plays);
  const loading = usePlayStore((s) => s.loading);
  const fetchPlays = usePlayStore((s) => s.fetchPlays);
  const fetchCurrentUser = useUserStore((s) => s.fetchCurrentUser);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDevUserId(DEV_USER_ID);
    fetchCurrentUser();
  }, []);

  // Re-fetch when tab is focused (e.g. after uploading)
  useFocusEffect(
    useCallback(() => {
      fetchPlays();
    }, [])
  );

  // Poll while any play is processing
  const playList = Object.values(plays);
  const hasProcessing = playList.some((p) => p.status === 'processing');


  useEffect(() => {
    if (hasProcessing) {
      pollRef.current = setInterval(() => {
        fetchPlays();
      }, POLL_INTERVAL);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [hasProcessing]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Plays</Text>

      {loading && playList.length === 0 ? (
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
        <ScrollView style={styles.scrollList} contentContainerStyle={styles.playList}>
          {playList.map((play) => {
            const status = play.status ?? 'ready';
            return (
            <Pressable
              key={play.id}
              style={[
                styles.playCard,
                status === 'processing' && styles.playCardProcessing,
                status === 'failed' && styles.playCardFailed,
              ]}
              onPress={() => {
                if (status !== 'processing') {
                  router.push(`/play/${play.id}`);
                }
              }}
              disabled={status === 'processing'}
            >
              <View style={styles.playCardContent}>
                <View style={styles.playCardText}>
                  <Text style={styles.playTitle}>{play.title}</Text>
                  {status === 'processing' ? (
                    <Text style={styles.processingText}>
                      {play.progress || 'Putting together your script...'}
                    </Text>
                  ) : status === 'failed' ? (
                    <Text style={styles.failedText}>
                      {play.progress || 'Something went wrong parsing this script.'}
                    </Text>
                  ) : (
                    <Text style={styles.playMeta}>
                      {play.script_type.toUpperCase()} script
                    </Text>
                  )}
                </View>
                {status === 'processing' && (
                  <ActivityIndicator size="small" color="#534AB7" />
                )}
              </View>
            </Pressable>
            );
          })}
        </ScrollView>
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
  scrollList: {
    flex: 1,
  },
  playList: {
    gap: 12,
    paddingBottom: 80,
  },
  playCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#534AB7',
  },
  playCardProcessing: {
    borderLeftColor: '#EF9F27',
    backgroundColor: '#FFF8ED',
  },
  playCardFailed: {
    borderLeftColor: '#EF4444',
    backgroundColor: '#FFF5F5',
  },
  playCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playCardText: {
    flex: 1,
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
  processingText: {
    fontSize: 13,
    color: '#EF9F27',
    fontStyle: 'italic',
  },
  failedText: {
    fontSize: 13,
    color: '#EF4444',
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
