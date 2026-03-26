import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radii, shadows } from '../lib/theme';
import { api, API_URL, devUserId } from '../lib/api';
import type { Play } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMAGE_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - 4; // minus border width
const IMAGE_HEIGHT = IMAGE_WIDTH * 9 / 16; // 16:9 matches picker aspect ratio

interface PlayEditorProps {
  play: Play;
  coverUrl: string | null;
  onClose: () => void;
  onSaved: (updates: { title?: string; cover_uri?: string }) => void;
}

export function PlayEditor({ play, coverUrl, onClose, onSaved }: PlayEditorProps) {
  const [title, setTitle] = useState(play.title);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localCoverUrl, setLocalCoverUrl] = useState<string | null>(null);

  const displayCover = localCoverUrl ?? coverUrl;

  const [prevId, setPrevId] = useState(play.id);
  if (play.id !== prevId) {
    setPrevId(play.id);
    setTitle(play.title);
    setLocalCoverUrl(null);
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setLocalCoverUrl(asset.uri);
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const updates: { title?: string; cover_uri?: string } = {};

      if (trimmed !== play.title) {
        await api(`/plays/${play.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: trimmed }),
        });
        updates.title = trimmed;
      }

      if (localCoverUrl) {
        setUploading(true);
        const formData = new FormData();
        formData.append('image', {
          uri: localCoverUrl,
          type: 'image/jpeg',
          name: 'cover.jpg',
        } as any);

        const headers: Record<string, string> = {};
        if (__DEV__ && devUserId) headers['x-dev-user-id'] = devUserId;
        const res = await fetch(`${API_URL}/covers/${play.id}/upload`, {
          method: 'POST',
          body: formData,
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          updates.cover_uri = data.cover_uri;
        } else {
          const errData = await res.json().catch(() => null);
          const msg = errData?.error ?? 'Failed to upload image';
          Alert.alert('Upload Failed', msg);
          setUploading(false);
          setSaving(false);
          return;
        }
        setUploading(false);
      }

      onSaved(updates);
    } catch (err) {
      console.error('Failed to save play:', err);
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  const isBusy = saving || uploading;

  return (
    <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header — matches New Script */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Play</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={12}
              disabled={isBusy}
            >
              <Text style={styles.closeButtonText}>{'\u2715'}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Cover image area — styled like the drop zone */}
            <View style={[styles.imageCard, displayCover && styles.imageCardWithImage]}>
              {displayCover ? (
                <View style={styles.cropContainer}>
                  <Image
                    source={{ uri: displayCover }}
                    style={styles.cropImage}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <Pressable style={styles.emptyImageArea} onPress={handlePickImage}>
                  <Text style={styles.emptyImageEmoji}>{'\uD83C\uDFAD'}</Text>
                  <Text style={styles.emptyImageTitle}>Add Cover Image</Text>
                  <Text style={styles.emptyImageDesc}>Tap to choose from your photos</Text>
                </Pressable>
              )}
            </View>

            {displayCover && (
              <View style={styles.imageControls}>
                <Pressable style={styles.changeImagePill} onPress={handlePickImage} disabled={isBusy}>
                  <Text style={styles.changeImageText}>Change Image</Text>
                </Pressable>
              </View>
            )}

            {/* Title input */}
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              editable={!isBusy}
              autoCapitalize="words"
              placeholder="Give your play a title..."
              placeholderTextColor={colors.textSecondary}
            />
          </ScrollView>

          {/* Pinned save button — matches New Script CTA */}
          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.saveButton, isBusy && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isBusy}
            >
              {isBusy ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
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

  // Image card — styled like the drop zone in New Script
  imageCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  imageCardWithImage: {
    borderStyle: 'solid',
    borderColor: colors.sage,
    padding: 0,
  },
  cropContainer: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    overflow: 'hidden',
    borderRadius: radii.md,
    alignSelf: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  cropImage: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  emptyImageArea: {
    paddingVertical: spacing.xxxxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyImageEmoji: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyImageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyImageDesc: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Controls below image
  imageControls: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  changeImagePill: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  changeImageText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.rose,
  },

  // Title input
  titleInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: 18,
    color: colors.text,
  },

  // Pinned bottom bar — matches New Script
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
});
