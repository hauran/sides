import { useRef, useState } from 'react';
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
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radii, shadows } from '../lib/theme';
import { api, API_URL, devUserId } from '../lib/api';
import type { Play } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMAGE_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - 4;
const IMAGE_HEIGHT = IMAGE_WIDTH * 9 / 16;

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
  const [cropDirty, setCropDirty] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Pan/zoom state (using refs to avoid re-renders during gestures)
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const lastDistance = useRef(0);
  const lastTx = useRef(0);
  const lastTy = useRef(0);
  const [, forceUpdate] = useState(0);

  const displayCover = localCoverUrl ?? coverUrl;

  const [prevId, setPrevId] = useState(play.id);
  if (play.id !== prevId) {
    setPrevId(play.id);
    setTitle(play.title);
    setLocalCoverUrl(null);
    setCropDirty(false);
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
  }

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function clampTranslation(tx: number, ty: number, s: number) {
    const maxTx = Math.max(0, (IMAGE_WIDTH * s - IMAGE_WIDTH) / 2);
    const maxTy = Math.max(0, (IMAGE_HEIGHT * s - IMAGE_HEIGHT) / 2);
    return {
      x: clamp(tx, -maxTx, maxTx),
      y: clamp(ty, -maxTy, maxTy),
    };
  }

  function getDistance(touches: any[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        lastTx.current = txRef.current;
        lastTy.current = tyRef.current;
        if (evt.nativeEvent.touches.length === 2) {
          lastDistance.current = getDistance(evt.nativeEvent.touches);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          // Pinch zoom
          const dist = getDistance(touches);
          if (lastDistance.current > 0) {
            const newScale = clamp(scaleRef.current * (dist / lastDistance.current), 1, 5);
            scaleRef.current = newScale;
          }
          lastDistance.current = dist;
          const clamped = clampTranslation(txRef.current, tyRef.current, scaleRef.current);
          txRef.current = clamped.x;
          tyRef.current = clamped.y;
        } else {
          // Pan
          const newTx = lastTx.current + gestureState.dx;
          const newTy = lastTy.current + gestureState.dy;
          const clamped = clampTranslation(newTx, newTy, scaleRef.current);
          txRef.current = clamped.x;
          tyRef.current = clamped.y;
        }
        forceUpdate(n => n + 1);
      },
      onPanResponderRelease: () => {
        lastDistance.current = 0;
        setCropDirty(true);
      },
    })
  ).current;

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      // Delete cached cover
      await api(`/covers/${play.id}`, { method: 'DELETE' });
      // Regenerate
      const data = await api<{ cover_uri?: string }>(`/covers/${play.id}`, { method: 'POST' });
      if (data.cover_uri) {
        setLocalCoverUrl(null);
        setCropDirty(false);
        scaleRef.current = 1;
        txRef.current = 0;
        tyRef.current = 0;
        onSaved({ cover_uri: data.cover_uri });
      }
    } catch (err) {
      console.error('Regenerate failed:', err);
      Alert.alert('Error', 'Failed to regenerate cover.');
    } finally {
      setRegenerating(false);
    }
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
    setCropDirty(false);
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
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
      } else if (cropDirty) {
        // Send crop params to server
        const s = scaleRef.current;
        const tx = txRef.current;
        const ty = tyRef.current;

        const viewFracW = 1 / s;
        const viewFracH = 1 / s;
        const centerX = 0.5 - (tx / IMAGE_WIDTH) / s;
        const centerY = 0.5 - (ty / IMAGE_HEIGHT) / s;
        const cropX = Math.max(0, centerX - viewFracW / 2);
        const cropY = Math.max(0, centerY - viewFracH / 2);

        await api(`/covers/${play.id}/crop`, {
          method: 'PATCH',
          body: JSON.stringify({ x: cropX, y: cropY, zoom: s }),
        });
        updates.cover_uri = `/api/covers/${play.id}/image`;
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

  const isBusy = saving || uploading || regenerating;

  const imageTransform = displayCover
    ? { transform: [{ translateX: txRef.current }, { translateY: tyRef.current }, { scale: scaleRef.current }] }
    : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
            scrollEnabled={!displayCover || scaleRef.current <= 1}
          >
            <View style={[styles.imageCard, displayCover && styles.imageCardWithImage]}>
              {displayCover ? (
                <View style={styles.cropContainer} {...panResponder.panHandlers}>
                  <Image
                    source={{ uri: displayCover }}
                    style={[styles.cropImage, imageTransform]}
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
                <Text style={styles.cropHint}>Pinch to zoom, drag to pan</Text>
                <View style={styles.imageButtonRow}>
                  <Pressable style={styles.changeImagePill} onPress={handlePickImage} disabled={isBusy}>
                    <Text style={styles.changeImageText}>Change Image</Text>
                  </Pressable>
                  <Pressable style={styles.changeImagePill} onPress={handleRegenerate} disabled={isBusy}>
                    {regenerating ? (
                      <ActivityIndicator color={colors.rose} size="small" />
                    ) : (
                      <Text style={styles.changeImageText}>Regenerate</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

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
  imageControls: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  cropHint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  imageButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  titleInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: 18,
    color: colors.text,
  },
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
