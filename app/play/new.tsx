import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../src/lib/api';
import { usePlayStore } from '../../src/store/usePlayStore';
import type { Play } from '../../src/types';

export default function NewPlayScreen() {
  const router = useRouter();
  const addPlay = usePlayStore((s) => s.addPlay);

  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const canSubmit = title.trim().length > 0 && selectedFile !== null && !uploading;

  async function handlePickPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/pdf',
      });
    } catch (err) {
      console.error('Document picker error:', err);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  }

  function handleTakePhotos() {
    Alert.alert('Coming soon', 'Photo upload will be available in a future update.');
  }

  function handleRemoveFile() {
    setSelectedFile(null);
  }

  async function handleUpload() {
    if (!canSubmit || !selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.mimeType,
      } as unknown as Blob);

      const play = await api<Play>('/plays/upload', {
        method: 'POST',
        body: formData,
      });
      addPlay(play);

      // Go home — the play card will show processing state
      router.dismiss();
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert(
        'Upload Failed',
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Upload a Script</Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Romeo and Juliet"
          placeholderTextColor="#999999"
          value={title}
          onChangeText={setTitle}
          editable={!uploading}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Upload Method</Text>
        <View style={styles.optionsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.option,
              selectedFile && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
            onPress={handlePickPDF}
            disabled={uploading}
          >
            <Text style={styles.optionIcon}>{'\u{1F4C4}'}</Text>
            <Text style={styles.optionTitle}>Upload PDF</Text>
            <Text style={styles.optionDesc}>Select a PDF of your script</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            onPress={handleTakePhotos}
            disabled={uploading}
          >
            <Text style={styles.optionIcon}>{'\u{1F4F7}'}</Text>
            <Text style={styles.optionTitle}>Take Photos</Text>
            <Text style={styles.optionDesc}>Photograph your script pages</Text>
          </Pressable>
        </View>

        {selectedFile && (
          <View style={styles.fileRow}>
            <Text style={styles.fileIcon}>{'\u{1F4CE}'}</Text>
            <Text style={styles.fileName} numberOfLines={1}>
              {selectedFile.name}
            </Text>
            <Pressable
              style={styles.removeButton}
              onPress={handleRemoveFile}
              hitSlop={8}
              disabled={uploading}
            >
              <Text style={styles.removeButtonText}>{'\u2715'}</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
          onPress={handleUpload}
          disabled={!canSubmit}
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text
              style={[styles.createButtonText, !canSubmit && styles.createButtonTextDisabled]}
            >
              Create Play
            </Text>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={uploading}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  option: {
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#D8D6F5',
  },
  optionSelected: {
    borderColor: '#534AB7',
    backgroundColor: '#E8E6FE',
  },
  optionPressed: {
    opacity: 0.7,
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
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 24,
    gap: 10,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A2E',
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D8D6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    color: '#534AB7',
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#534AB7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#C5C2E0',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  createButtonTextDisabled: {
    color: '#EEEDFE',
  },
  cancelButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#534AB7',
  },
});
