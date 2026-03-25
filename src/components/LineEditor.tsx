import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, radii, shadows } from '../lib/theme';
import type { Line } from '../types';

export interface LineEditorProps {
  line: Line;
  visible: boolean;
  onClose: () => void;
  onSave: (lineId: string, newText: string) => Promise<void>;
}

export function LineEditor({ line, visible, onClose, onSave }: LineEditorProps) {
  const [text, setText] = useState(line.text);
  const [saving, setSaving] = useState(false);

  // Reset text when a new line is opened
  const [prevLineId, setPrevLineId] = useState(line.id);
  if (line.id !== prevLineId) {
    setPrevLineId(line.id);
    setText(line.text);
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === line.text) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(line.id, trimmed);
      onClose();
    } catch (err) {
      console.error('Failed to save line:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.characterName}>
              {line.character_name ?? 'UNKNOWN'}
            </Text>
            {line.edited && (
              <View style={styles.editedBadge}>
                <Text style={styles.editedBadgeText}>edited</Text>
              </View>
            )}
          </View>

          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
            editable={!saving}
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(45, 42, 38, 0.4)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 20,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  characterName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.rose,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  editedBadge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  editedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.rose,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: 'Georgia',
    color: colors.text,
    minHeight: 100,
    maxHeight: 200,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.rose,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textInverse,
  },
});
