import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore, useIsAuthenticated } from '../../src/store/useAuthStore';
import { api, API_URL } from '../../src/lib/api';
import { colors, spacing, radii, shadows, typography } from '../../src/lib/theme';

interface InviteInfo {
  token: string;
  status: string;
  play: { id: string; title: string; cover_uri: string | null } | null;
  character: { id: string; name: string } | null;
}

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const setPendingInviteToken = useAuthStore((s) => s.setPendingInviteToken);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchInvite();
  }, [token]);

  async function fetchInvite() {
    try {
      const res = await fetch(`${API_URL}/invites/${token}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Invalid invite');
        return;
      }
      setInvite(body.invite);
    } catch (err) {
      setError('Failed to load invite');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!isAuthenticated) {
      // Save token and redirect to login — after login, we'll come back
      setPendingInviteToken(token!);
      router.replace('/login');
      return;
    }

    setAccepting(true);
    try {
      const result = await api<{ play_id: string }>(`/invites/${token}/accept`, {
        method: 'POST',
      });
      router.replace(`/play/${result.play_id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept invite');
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.rose} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Text style={styles.errorEmoji}>{'\u{1F3AD}'}</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
          <Text style={styles.backButtonText}>Go home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, styles.centered]}>
      <Text style={styles.emoji}>{'\u{1F3AD}'}</Text>
      <Text style={styles.heading}>You've been cast!</Text>

      {invite?.play && (
        <Text style={styles.playTitle}>{invite.play.title}</Text>
      )}

      {invite?.character && (
        <Text style={styles.characterInfo}>
          as <Text style={styles.characterName}>{invite.character.name}</Text>
        </Text>
      )}

      <Pressable
        style={[styles.acceptButton, accepting && { opacity: 0.6 }]}
        onPress={handleAccept}
        disabled={accepting}
      >
        {accepting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.acceptButtonText}>
            {isAuthenticated ? 'Join the cast' : 'Sign in to join'}
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.xxl,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  playTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  characterInfo: {
    fontSize: 17,
    color: colors.textSecondary,
    marginBottom: spacing.xxxl,
  },
  characterName: {
    fontWeight: '700',
    color: colors.rose,
  },
  acceptButton: {
    height: 52,
    paddingHorizontal: 40,
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: spacing.xl,
  },
  errorText: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.rose,
  },
});
