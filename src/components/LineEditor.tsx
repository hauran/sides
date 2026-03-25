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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  characterName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#534AB7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editedBadge: {
    backgroundColor: '#F5F4FE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#534AB7',
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#EEEDFE',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Georgia',
    color: '#1A1A2E',
    minHeight: 100,
    maxHeight: 200,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999999',
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#534AB7',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
