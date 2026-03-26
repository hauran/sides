import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '../src/store/useUserStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { api } from '../src/lib/api';
import { pickAvatarImage, uploadAvatarImage, resolveAvatarUrl } from '../src/lib/avatar';
import { colors, spacing, radii, shadows, typography } from '../src/lib/theme';
import { getInitials } from '../src/lib/utils';

export default function SettingsScreen() {
  const router = useRouter();
  const currentUser = useUserStore((s) => s.currentUser);
  const fetchCurrentUser = useUserStore((s) => s.fetchCurrentUser);
  const logout = useAuthStore((s) => s.logout);

  const [displayName, setDisplayName] = useState(currentUser?.name ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(currentUser?.avatar_uri ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.name);
      setAvatarUri(currentUser.avatar_uri);
    }
  }, [currentUser]);

  async function pickAvatar() {
    const uri = await pickAvatarImage();
    if (uri) setAvatarUri(uri);
  }

  async function handleSave() {
    const trimmed = displayName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      // Update name
      await Promise.all([
        api('/users/me', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) }),
        avatarUri ? uploadAvatarImage(avatarUri) : Promise.resolve(),
      ]);

      await fetchCurrentUser();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const avatarUrl = resolveAvatarUrl(avatarUri);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Custom header bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.headerDone}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Avatar */}
        <Pressable style={styles.avatarPicker} onPress={pickAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {displayName.trim() ? getInitials(displayName.trim()) : '?'}
              </Text>
            </View>
          )}
          <Text style={styles.avatarLabel}>Change photo</Text>
        </Pressable>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Text>
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          style={styles.signOutButton}
          onPress={() =>
            Alert.alert('Sign Out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
            ])
          }
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  headerDone: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.rose,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
  },
  avatarPicker: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.roseSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.rose,
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.rose,
    marginTop: spacing.sm,
  },
  field: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.rose,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    letterSpacing: 0,
    color: colors.text,
    ...shadows.sm,
  },
  saveButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.md,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  spacer: {
    flex: 1,
  },
  signOutButton: {
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 40,
    backgroundColor: colors.coralSoft,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.coral,
  },
});
