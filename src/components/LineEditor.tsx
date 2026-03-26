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
  ScrollView,
} from 'react-native';
import { colors, spacing, radii, shadows } from '../lib/theme';
import type { Line } from '../types';

interface Character {
  id: string;
  name: string;
}

export interface LineEditorProps {
  line: Line;
  characters: Character[];
  visible: boolean;
  onClose: () => void;
  onSave: (lineId: string, updates: { text?: string; character_ids?: string[] }) => Promise<void>;
}

export function LineEditor({ line, characters, visible, onClose, onSave }: LineEditorProps) {
  const [text, setText] = useState(line.text);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(line.character_ids ?? (line.character_id ? [line.character_id] : []));
  });
  const [saving, setSaving] = useState(false);

  // Reset when a new line is opened
  const [prevLineId, setPrevLineId] = useState(line.id);
  if (line.id !== prevLineId) {
    setPrevLineId(line.id);
    setText(line.text);
    setSelectedIds(new Set(line.character_ids ?? (line.character_id ? [line.character_id] : [])));
  }

  function toggleCharacter(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedNames = characters.filter(c => selectedIds.has(c.id)).map(c => c.name);
  const hasTextChange = text.trim() !== line.text;
  const originalIds = new Set(line.character_ids ?? (line.character_id ? [line.character_id] : []));
  const hasCharChange = selectedIds.size !== originalIds.size || ![...selectedIds].every(id => originalIds.has(id));
  const hasChanges = hasTextChange || hasCharChange;

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const updates: { text?: string; character_ids?: string[] } = {};
      if (hasTextChange) updates.text = trimmed;
      if (hasCharChange) {
        updates.character_ids = [...selectedIds];
      }
      await onSave(line.id, updates);
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Line</Text>
            {line.edited && (
              <View style={styles.editedBadge}>
                <Text style={styles.editedBadgeText}>edited</Text>
              </View>
            )}
          </View>

          {/* Speaker selector */}
          <Text style={styles.sectionLabel}>SPEAKER</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              style={[styles.chip, selectedIds.size === 0 && styles.chipSelected]}
              onPress={() => setSelectedIds(new Set())}
            >
              <Text style={[styles.chipText, selectedIds.size === 0 && styles.chipTextSelected]}>
                None
              </Text>
            </Pressable>
            {characters.map(c => (
              <Pressable
                key={c.id}
                style={[styles.chip, selectedIds.has(c.id) && styles.chipSelected]}
                onPress={() => toggleCharacter(c.id)}
              >
                <Text style={[styles.chipText, selectedIds.has(c.id) && styles.chipTextSelected]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Text input */}
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
            editable={!saving}
            placeholder="Line text..."
            placeholderTextColor={colors.textSecondary}
          />

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
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
    gap: 16,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.rose,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.rose,
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
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textInverse,
  },
});
