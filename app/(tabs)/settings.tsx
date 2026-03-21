import { View, Text, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { useSettingsStore } from '../../src/store/useSettingsStore';

export default function SettingsScreen() {
  const displayName = useSettingsStore((s) => s.displayName);
  const elevenLabsApiKey = useSettingsStore((s) => s.elevenLabsApiKey);
  const setDisplayName = useSettingsStore((s) => s.setDisplayName);
  const setElevenLabsApiKey = useSettingsStore((s) => s.setElevenLabsApiKey);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const handleSave = async () => {
    await saveSettings();
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor="#BBBBBB"
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ElevenLabs API Key</Text>
        <TextInput
          style={styles.input}
          value={elevenLabsApiKey}
          onChangeText={setElevenLabsApiKey}
          placeholder="sk-..."
          placeholderTextColor="#BBBBBB"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Used for AI-voiced scene partners. Get one at elevenlabs.io
        </Text>
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
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#534AB7',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A2E',
  },
  hint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
    paddingLeft: 2,
  },
  saveButton: {
    backgroundColor: '#534AB7',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  spacer: {
    flex: 1,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#EF4444',
  },
});
