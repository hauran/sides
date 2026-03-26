import { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayStore } from '../src/store/usePlayStore';
import { useUserStore } from '../src/store/useUserStore';
import { useIsAuthenticated } from '../src/store/useAuthStore';
import { colors, spacing, radii, shadows } from '../src/lib/theme';
import { useCoverImage } from '../src/hooks/useCoverImage';

const POLL_INTERVAL = 5000;

function HeroCard({ play, status, isInteractive, onPress, onEdit, renderStatusDetail }: {
  play: any; status: string; isInteractive: boolean;
  onPress: () => void; onEdit: () => void; renderStatusDetail: (play: any) => React.ReactNode;
}) {
  const coverUrl = useCoverImage(play.id, play.cover_uri ?? null);

  const editButton = status === 'ready' ? (
    <Pressable style={styles.cardEditButton} onPress={onEdit} hitSlop={8}>
      <Text style={styles.cardEditIcon}>{'\u270E'}</Text>
    </Pressable>
  ) : null;

  if (coverUrl) {
    return (
      <Pressable onPress={() => isInteractive && onPress()} disabled={!isInteractive}>
        <ImageBackground
          source={{ uri: coverUrl }}
          resizeMode="cover"
          style={[styles.heroCardImage, status === 'processing' && styles.cardProcessing, status === 'failed' && styles.cardFailed]}
        >
          <View style={styles.heroOverlay}>
            {editButton}
            <View style={styles.heroOverlayContent}>
              <Text style={styles.heroTitleOnImage}>{play.title}</Text>
              {status !== 'ready' && renderStatusDetail(play)}
            </View>
          </View>
        </ImageBackground>
      </Pressable>
    );
  }

  // No cover yet — show a warm gradient placeholder
  return (
    <Pressable
      style={[styles.heroCardPlaceholder]}
      onPress={() => isInteractive && onPress()}
      disabled={!isInteractive}
    >
      {editButton}
      <Text style={styles.heroTitleOnImage}>{play.title}</Text>
      {status !== 'ready' && renderStatusDetail(play)}
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const plays = usePlayStore((s) => s.plays);
  const loading = usePlayStore((s) => s.loading);
  const fetchPlays = usePlayStore((s) => s.fetchPlays);
  const fetchCurrentUser = useUserStore((s) => s.fetchCurrentUser);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCurrentUser();
    }
  }, [isAuthenticated]);

  // Re-fetch when screen is focused (e.g. after uploading)
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

  // All plays in one list, ordered: ready first, then processing, then failed
  const readyPlays = playList.filter((p) => p.status === 'ready');
  const processingPlays = playList.filter((p) => p.status === 'processing');
  const failedPlays = playList.filter((p) => p.status === 'failed');
  const orderedPlays = [...processingPlays, ...readyPlays, ...failedPlays];

  // ---- Empty state ----
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>{'\u{1F3AD}'}</Text>
      <Text style={styles.emptyHeading}>Your stage is empty</Text>
      <Text style={styles.emptySubtitle}>Upload a script to start rehearsing</Text>
      <Pressable
        style={styles.emptyCta}
        onPress={() => router.push('/play/new')}
      >
        <Text style={styles.emptyCtaText}>Add your first script</Text>
      </Pressable>
    </View>
  );

  // ---- Status helpers ----
  const renderStatusDetail = (play: (typeof playList)[0]) => {
    const status = play.status ?? 'ready';
    if (status === 'processing') {
      return (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={styles.processingText}>
            {play.progress || 'Putting together your script...'}
          </Text>
        </View>
      );
    }
    if (status === 'failed') {
      return (
        <Text style={styles.failedText}>
          {play.progress || 'Something went wrong parsing this script.'}
        </Text>
      );
    }
    return null;
  };

  // ---- Render all plays as uniform large cards ----

  // ---- Loading state ----
  if (loading && playList.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topRow}>
          <Text style={styles.wordmark}>sides</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
            <Text style={styles.gearIcon}>{'\u2699'}</Text>
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.rose} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <Text style={styles.wordmark}>sides</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <Text style={styles.gearIcon}>{'\u2699'}</Text>
        </Pressable>
      </View>

      {playList.length === 0 ? (
        renderEmpty()
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {orderedPlays.map((play) => {
            const status = play.status ?? 'ready';
            const isInteractive = status !== 'processing';
            return (
              <HeroCard
                key={play.id}
                play={play}
                status={status}
                isInteractive={isInteractive}
                onPress={() => router.push(`/play/${play.id}`)}
                onEdit={() => router.push(`/play/${play.id}/edit`)}
                renderStatusDetail={renderStatusDetail}
              />
            );
          })}
        </ScrollView>
      )}

      {/* Floating add button */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/play/new')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  gearIcon: {
    fontSize: 26,
    color: colors.textSecondary,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: spacing.xl,
  },
  emptyHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxxl,
  },
  emptyCta: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 40,
    ...shadows.md,
  },
  emptyCtaText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textInverse,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 40,
  },

  // Hero with image — no padding on card, overlay handles it
  heroCardImage: {
    borderRadius: 20,
    minHeight: 220,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  heroCardPlaceholder: {
    borderRadius: 20,
    minHeight: 220,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    backgroundColor: colors.sage,
    justifyContent: 'flex-end',
    padding: spacing.xxl,
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 35, 30, 0.55)',
  },
  heroOverlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.xxl,
  },
  heroTitleOnImage: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  // Floating add button
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.rose,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
  fabText: {
    fontSize: 28,
    fontWeight: '400',
    color: colors.textInverse,
    lineHeight: 30,
  },

  // Edit button on cards
  cardEditButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardEditIcon: {
    fontSize: 14,
    color: colors.textInverse,
  },

  // Status styles
  cardProcessing: {
    borderWidth: 1,
    borderColor: colors.honey,
    backgroundColor: colors.honeySoft,
  },
  cardFailed: {
    borderWidth: 1,
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  processingText: {
    fontSize: 13,
    color: colors.textInverse,
    fontStyle: 'italic',
    flex: 1,
    opacity: 0.85,
  },
  failedText: {
    fontSize: 13,
    color: '#FFB4AB',
    marginTop: spacing.xs,
  },
});
