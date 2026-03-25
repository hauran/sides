import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../src/lib/api';
import { usePlayStore } from '../../src/store/usePlayStore';
import { colors, spacing, radii, shadows } from '../../src/lib/theme';
import type { Play } from '../../src/types';

/** Derive a play title from a filename: "Romeo_and_Juliet_Script.pdf" → "Romeo and Juliet Script" */
function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')          // strip extension
    .replace(/[_-]/g, ' ')            // underscores/hyphens to spaces
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function NewPlayScreen() {
  const router = useRouter();
  const addPlay = usePlayStore((s) => s.addPlay);

  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const canSubmit = selectedFile !== null && !uploading;

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
      formData.append('title', titleFromFilename(selectedFile.name));
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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header: title + X */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Script</Text>
          <Pressable
            style={styles.closeButton}
            onPress={() => router.back()}
            hitSlop={12}
            disabled={uploading}
          >
            <Text style={styles.closeButtonText}>{'\u2715'}</Text>
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* PDF upload drop zone */}
          <Pressable
            style={({ pressed }) => [
              styles.dropZone,
              selectedFile && styles.dropZoneSelected,
              pressed && styles.dropZonePressed,
            ]}
            onPress={handlePickPDF}
            disabled={uploading}
          >
            <Text style={styles.dropZoneIcon}>{'\uD83D\uDCC4'}</Text>
            <Text style={styles.dropZoneTitle}>Upload PDF</Text>
            <Text style={styles.dropZoneDesc}>
              Tap to select a script from your files
            </Text>
          </Pressable>

          {/* Selected file pill */}
          {selectedFile && (
            <View style={styles.filePill}>
              <Text style={styles.filePillIcon}>{'\uD83D\uDCCE'}</Text>
              <Text style={styles.filePillName} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Pressable
                style={styles.filePillRemove}
                onPress={handleRemoveFile}
                hitSlop={8}
                disabled={uploading}
              >
                <Text style={styles.filePillRemoveText}>{'\u2715'}</Text>
              </Pressable>
            </View>
          )}

          {/* Photos option */}
          <Pressable
            style={({ pressed }) => [
              styles.photoCard,
              pressed && styles.photoCardPressed,
            ]}
            onPress={handleTakePhotos}
            disabled={uploading}
          >
            <Text style={styles.photoCardIcon}>{'\uD83D\uDCF7'}</Text>
            <View style={styles.photoCardTextContainer}>
              <Text style={styles.photoCardTitle}>Take Photos</Text>
              <Text style={styles.photoCardDesc}>Photograph your script pages</Text>
            </View>
          </Pressable>

        </ScrollView>

        {/* Pinned CTA at bottom */}
        <View style={styles.bottomBar}>
          <Pressable
            style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
            onPress={handleUpload}
            disabled={!canSubmit}
          >
            {uploading ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Text
                style={[
                  styles.createButtonText,
                  !canSubmit && styles.createButtonTextDisabled,
                ]}
              >
                Create Play
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  dropZone: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.xxxxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  dropZoneSelected: {
    borderColor: colors.sage,
    backgroundColor: colors.sageSoft,
    borderStyle: 'solid',
  },
  dropZonePressed: {
    opacity: 0.7,
  },
  dropZoneIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  dropZoneTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  dropZoneDesc: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  filePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sageSoft,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  filePillIcon: {
    fontSize: 14,
  },
  filePillName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filePillRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePillRemoveText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textInverse,
  },
  photoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    ...shadows.sm,
  },
  photoCardPressed: {
    opacity: 0.7,
  },
  photoCardIcon: {
    fontSize: 28,
    marginRight: spacing.lg,
  },
  photoCardTextContainer: {
    flex: 1,
  },
  photoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  photoCardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  createButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: colors.roseMuted,
  },
  createButtonText: {
    color: colors.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
  createButtonTextDisabled: {
    opacity: 0.7,
  },
});
