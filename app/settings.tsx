import { View, Text, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { colors, spacing, radii, shadows, typography } from '../src/lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const displayName = useSettingsStore((s) => s.displayName);
  const setDisplayName = useSettingsStore((s) => s.setDisplayName);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const handleSave = async () => {
    await saveSettings();
    Alert.alert('Saved', 'Your settings have been saved.');
  };

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

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          style={styles.signOutButton}
          onPress={() =>
            Alert.alert('Sign Out', 'Sign out is not implemented yet.')
          }
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

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
