import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function NewPlayScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Upload a Script</Text>

      <View style={styles.optionsContainer}>
        <Pressable style={styles.option}>
          <Text style={styles.optionIcon}>{'\u{1F4C4}'}</Text>
          <Text style={styles.optionTitle}>Upload PDF</Text>
          <Text style={styles.optionDesc}>
            Import a script as a PDF file
          </Text>
        </Pressable>

        <Pressable style={styles.option}>
          <Text style={styles.optionIcon}>{'\u{1F4F7}'}</Text>
          <Text style={styles.optionTitle}>Take Photos</Text>
          <Text style={styles.optionDesc}>
            Photograph each page of your script
          </Text>
        </Pressable>
      </View>

      <Text style={styles.comingSoon}>
        Script upload will be available in the next milestone.
      </Text>

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
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 16,
  },
  option: {
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D8D6F5',
  },
  optionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 14,
    color: '#666666',
  },
  comingSoon: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    marginTop: 32,
    fontStyle: 'italic',
  },
  closeButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 14,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#534AB7',
  },
});
