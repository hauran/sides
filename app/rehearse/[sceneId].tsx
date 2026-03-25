import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows } from '../../src/lib/theme';
import { useSceneStore } from '../../src/store/useSceneStore';
import { DEV_USER_ID, api, setDevUserId, uploadRecording } from '../../src/lib/api';
import { createLineSpeaker } from '../../src/lib/tts';
import { useTranscription, TranscriptionError } from '../../src/hooks/useTranscription';
import { useRecording } from '../../src/hooks/useRecording';
import { isLineMatch } from '../../src/lib/matchLine';
import { useCastStore } from '../../src/store/useCastStore';
import { LineEditor } from '../../src/components/LineEditor';
import type { Line } from '../../src/types';

const TRANSCRIPTION_ERROR_MESSAGES: Record<TranscriptionError, string> = {
  'mic-unavailable': 'Mic unavailable — tap "Done" to advance',
  'not-available': 'Speech recognition requires a development build',
  'permission-denied': 'Microphone permission denied',
  'unknown': 'Speech recognition error',
};

type RehearsalState = 'idle' | 'loading' | 'playing' | 'my_turn' | 'paused' | 'done';
type RehearsalMode = 'learning' | 'practice' | 'recording';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function RehearsalScreen() {
  const { sceneId, characterIds: characterIdsParam } = useLocalSearchParams<{
    sceneId: string;
    characterIds: string;
  }>();
  const myCharacterIds = useMemo(
    () => new Set((characterIdsParam ?? '').split(',').filter(Boolean)),
    [characterIdsParam]
  );
  const router = useRouter();
  const scenes = useSceneStore((s) => s.scenes);
  const scene = sceneId ? scenes[sceneId] : undefined;
  const fetchLines = useSceneStore((s) => s.fetchLines);
  const getLinesForScene = useSceneStore((s) => s.getLinesForScene);
  const scrollRef = useRef<ScrollView>(null);
  const lineRefs = useRef<Record<string, number>>({});
  const currentPlayer = useRef<AudioPlayer | null>(null);

  const [state, setState] = useState<RehearsalState>('idle');
  const [mode, setMode] = useState<RehearsalMode>('learning');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [hintLevel, setHintLevel] = useState(0); // 0 = hidden, 1+ = words revealed
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micPulseAnim = useRef(new Animated.Value(0.4)).current;

  // Recording mode state
  const { startRecording, stopRecording, isRecording, durationMillis } = useRecording();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const recordingActiveRef = useRef(false);
  const recPulseAnim = useRef(new Animated.Value(1)).current;
  const addRecording = useCastStore((s) => s.addRecording);

  // Speech recognition for auto-advance
  const { transcript, isListening, isAvailable: isSpeechAvailable, start: startListening, stop: stopListening, error: speechError } = useTranscription();
  // Guard against double-advancing: track which line index was already auto-advanced
  const autoAdvancedRef = useRef(-1);

  useEffect(() => {
    setDevUserId(DEV_USER_ID);
    if (sceneId) {
      setLinesLoaded(false);
      // Fetch scene metadata + lines
      Promise.all([
        api<{ id: string; name: string; play_id: string; sort: number }>(`/scenes/${sceneId}`)
          .then((s) => useSceneStore.getState().setScene(s)),
        fetchLines(sceneId),
      ]).then(() => setLinesLoaded(true));
    }

    return () => {
      currentPlayer.current?.remove();
    };
  }, [sceneId]);

  const allLines = useSceneStore((s) => s.lines);
  const lines = useMemo(
    () => sceneId ? getLinesForScene(sceneId) : [],
    [sceneId, allLines]
  );
  const currentLine = lines[currentLineIndex] as Line | undefined;

  // Helper: stop recording and upload the result
  const stopAndUploadRecording = useCallback(async (lineId: string) => {
    if (!recordingActiveRef.current) return;
    recordingActiveRef.current = false;
    try {
      const uri = await stopRecording();
      if (uri) {
        setIsUploading(true);
        try {
          const recording = await uploadRecording(lineId, uri);
          addRecording(recording);
        } catch (err) {
          console.error('Failed to upload recording:', err);
        } finally {
          setIsUploading(false);
        }
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  }, [stopRecording, addRecording]);

  // Helper: start recording for a line (with optional countdown for first line)
  const beginRecordingForLine = useCallback(async (isFirstLine: boolean) => {
    if (isFirstLine) {
      // Countdown 3, 2, 1 before starting
      for (let i = 3; i >= 1; i--) {
        setCountdown(i);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setCountdown(null);
    }
    try {
      await startRecording();
      recordingActiveRef.current = true;
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [startRecording]);

  // Start/stop listening based on rehearsal state
  const listenDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStateRef = useRef<RehearsalState>('idle');
  useEffect(() => {
    const wasMyTurn = prevStateRef.current === 'my_turn';
    prevStateRef.current = state;

    if (state === 'my_turn' && isSpeechAvailable) {
      autoAdvancedRef.current = -1;
      listenDelayRef.current = setTimeout(async () => {
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        } catch (e) { console.warn('[Audio] mode switch failed:', e); }
        startListening();
      }, 800);
    } else if (wasMyTurn) {
      // Only clean up when leaving my_turn, not on every non-my_turn state
      if (listenDelayRef.current) {
        clearTimeout(listenDelayRef.current);
        listenDelayRef.current = null;
      }
      stopListening();
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }, [state, isSpeechAvailable]);

  // Auto-advance when transcript matches expected line
  useEffect(() => {
    if (state !== 'my_turn') return;
    if (!currentLine?.text || !transcript) return;
    if (autoAdvancedRef.current === currentLineIndex) return;

    if (isLineMatch(transcript, currentLine.text)) {
      autoAdvancedRef.current = currentLineIndex;
      stopListening();

      if (mode === 'recording' && recordingActiveRef.current) {
        // Stop recording and upload, then advance
        stopAndUploadRecording(currentLine.id).then(() => {
          advanceFrom(currentLineIndex);
        });
      } else {
        // Small delay so the user sees the match before advancing
        setTimeout(() => {
          advanceFrom(currentLineIndex);
        }, 400);
      }
    }
  }, [transcript, state, currentLineIndex, currentLine?.text, mode]);

  // Pulsing animation for the mic indicator dot
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(micPulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      micPulseAnim.setValue(0.4);
    }
  }, [isListening]);

  // Pulsing animation for recording indicator
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recPulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(recPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      recPulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Stop listening when leaving the screen
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // Pulse animation for my_turn
  useEffect(() => {
    if (state === 'my_turn') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  // Auto-scroll to current line
  useEffect(() => {
    if (state !== 'idle' && currentLine) {
      const y = lineRefs.current[currentLine.id];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
      }
    }
  }, [currentLineIndex, state]);

  // Track whether recording mode just started for the first line countdown
  const isFirstRecordingLineRef = useRef(false);

  // Start recording when entering my_turn in recording mode
  useEffect(() => {
    if (state === 'my_turn' && mode === 'recording' && !recordingActiveRef.current && countdown === null) {
      const isFirst = isFirstRecordingLineRef.current;
      isFirstRecordingLineRef.current = false;
      beginRecordingForLine(isFirst);
    }
  }, [state, mode, countdown]);

  const playIdRef = useRef(0);

  function stopCurrentAudio() {
    playIdRef.current++;
    if (currentPlayer.current) {
      try { currentPlayer.current.pause(); } catch (_) {}
      try { currentPlayer.current.remove(); } catch (_) {}
      currentPlayer.current = null;
    }
  }

  async function playOtherLine(index: number) {
    const line = lines[index];
    if (!line) return;

    stopCurrentAudio();
    const thisPlayId = playIdRef.current;

    setState('loading');
    try {
      // Ensure audio session is in playback mode (needed after recording/speech recognition)
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createLineSpeaker(line.text, line.character_name ?? 'DEFAULT');
      currentPlayer.current = player;

      player.addListener('playbackStatusUpdate', (status) => {
        // Ignore events from stale players
        if (playIdRef.current !== thisPlayId) return;
        if (status.playing) {
          setState('playing');
        }
        if (status.didJustFinish) {
          player.remove();
          if (currentPlayer.current === player) currentPlayer.current = null;
          advanceFrom(index);
        }
      });

      player.play();
    } catch (err) {
      console.error('TTS playback error:', err);
      if (playIdRef.current === thisPlayId) {
        setTimeout(() => advanceFrom(index), 2000);
      }
    }
  }

  function isMyLine(line: Line): boolean {
    return line.character_id != null && myCharacterIds.has(line.character_id);
  }

  function activateLine(index: number) {
    setCurrentLineIndex(index);
    setHintLevel(0);
    const line = lines[index];
    if (line && isMyLine(line)) {
      setState('my_turn');
    } else {
      playOtherLine(index);
    }
  }

  function startRehearsal() {
    if (mode === 'recording') {
      isFirstRecordingLineRef.current = true;
    }
    activateLine(0);
  }

  function advanceFrom(index: number) {
    const nextIndex = index + 1;
    if (nextIndex >= lines.length) {
      setState('done');
      return;
    }
    activateLine(nextIndex);
  }

  function handleAdvance() {
    stopCurrentAudio();
    stopListening();

    if (mode === 'recording' && recordingActiveRef.current && currentLine) {
      // Stop recording, upload, then advance
      stopAndUploadRecording(currentLine.id).then(() => {
        advanceFrom(currentLineIndex);
      });
    } else {
      advanceFrom(currentLineIndex);
    }
  }

  function handleTapLine(index: number) {
    if (state === 'done') return;
    stopCurrentAudio();

    // In recording mode, stop any active recording before jumping back
    if (mode === 'recording' && recordingActiveRef.current && currentLine) {
      // Discard current recording when re-recording (don't upload)
      recordingActiveRef.current = false;
      stopRecording().catch(() => {});
    }

    activateLine(index);
  }

  function handlePause() {
    stopCurrentAudio();
    stopListening();

    // Pause recording if active
    if (mode === 'recording' && recordingActiveRef.current && currentLine) {
      recordingActiveRef.current = false;
      stopRecording().catch(() => {});
    }

    setState('paused');
  }

  function handleLongPressLine(index: number) {
    // Only allow editing in idle, paused, or my_turn states
    if (state !== 'idle' && state !== 'paused' && state !== 'my_turn') return;
    const line = lines[index];
    if (!line) return;
    setEditingLine(line);
  }

  async function handleSaveLineEdit(lineId: string, newText: string) {
    const line = editingLine;
    // Persist to server
    await api<Line>(`/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text: newText }),
    });
    // Update local store
    useSceneStore.getState().updateLine(lineId, { text: newText, edited: true });
    // Invalidate TTS cache for the old text
    if (line?.character_name) {
      try {
        await api(`/tts/cache?character=${encodeURIComponent(line.character_name)}&text=${encodeURIComponent(line.text)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        // Non-critical — log and continue
        console.warn('TTS cache invalidation failed:', err);
      }
    }
  }

  function handleResume() {
    const line = lines[currentLineIndex];
    if (!line) return;
    activateLine(currentLineIndex);
  }

  const currentLineWords = useMemo(
    () => currentLine?.text.split(/\s+/) ?? [],
    [currentLine?.text]
  );

  function getHintText(): string {
    if (hintLevel === 0) return '• • •';
    if (hintLevel >= currentLineWords.length) return currentLine?.text ?? '';
    return currentLineWords.slice(0, hintLevel).join(' ') + ' ...';
  }

  function handleHint() {
    setHintLevel((prev) => Math.min(prev + 1, currentLineWords.length));
  }

  function shouldHideLine(line: Line, index: number): boolean {
    if (mode !== 'practice') return false;
    if (!isMyLine(line)) return false;
    // Hide future lines and current line
    const active = state !== 'idle' && state !== 'done';
    if (!active) return true; // hide all my lines when not actively rehearsing
    return index >= currentLineIndex;
  }

  function getLineStyle(line: Line, index: number) {
    const active = state !== 'idle';
    const isCurrent = index === currentLineIndex && active;
    const isPast = active && index < currentLineIndex;

    // Past lines fade out, current line gets breathing room via marginVertical
    if (isPast) return [styles.lineRowBase, styles.lineRowDone];
    if (isCurrent) return [styles.lineRowBase, styles.lineRowCurrent];
    return styles.lineRowBase;
  }

  if (!linesLoaded) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.rose} />
        <Text style={styles.loadingText}>Loading script...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Floating top bar — transparent, no solid band */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => { stopCurrentAudio(); stopListening(); router.back(); }}
        >
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </Pressable>
        <Text style={styles.sceneName} numberOfLines={1}>
          {scene?.name ?? 'Rehearsal'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Mode switcher — small floating pills */}
      <View style={styles.modeSwitcherRow}>
        <Pressable
          style={[
            styles.modePill,
            mode === 'learning' && styles.modePillActiveLearning,
          ]}
          onPress={() => setMode('learning')}
        >
          <Text
            style={[
              styles.modePillText,
              mode === 'learning' && styles.modePillTextActiveLearning,
            ]}
          >
            Learning
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.modePill,
            mode === 'practice' && styles.modePillActivePractice,
          ]}
          onPress={() => setMode('practice')}
        >
          <Text
            style={[
              styles.modePillText,
              mode === 'practice' && styles.modePillTextActivePractice,
            ]}
          >
            Practice
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.modePill,
            mode === 'recording' && styles.modePillActiveRecording,
          ]}
          onPress={() => setMode('recording')}
        >
          <Text
            style={[
              styles.modePillText,
              mode === 'recording' && styles.modePillTextActiveRecording,
            ]}
          >
            Recording
          </Text>
        </Pressable>
      </View>

      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Script — the hero area */}
      <ScrollView
        ref={scrollRef}
        style={styles.scriptScroll}
        contentContainerStyle={styles.scriptContent}
      >
        {lines.map((line, index) => (
          <Pressable
            key={line.id}
            onPress={() => handleTapLine(index)}
            onLongPress={() => handleLongPressLine(index)}
            onLayout={(e) => {
              lineRefs.current[line.id] = e.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              style={getLineStyle(line, index)}
            >
              {line.character_id ? (
                <>
                  <View style={styles.characterRow}>
                    <Text
                      style={[
                        styles.characterName,
                        isMyLine(line) && styles.characterNameMine,
                      ]}
                    >
                      {line.character_name ?? 'UNKNOWN'}
                    </Text>
                    {line.edited && (
                      <Text style={styles.editedIndicator}>(edited)</Text>
                    )}
                  </View>
                  {shouldHideLine(line, index)
                    ? <Text style={styles.hiddenLineText}>
                        {index === currentLineIndex && state === 'my_turn' ? getHintText() : '• • •'}
                      </Text>
                    : <Text style={styles.lineText}>{line.text}</Text>
                  }
                </>
              ) : (
                <Text style={styles.stageDirection}>{line.text}</Text>
              )}
            </Animated.View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Floating footer pill */}
      <View style={styles.footerWrapper}>
        <View style={styles.footerPill}>
          {state === 'idle' && (
            <Pressable style={styles.startButton} onPress={startRehearsal}>
              <Text style={styles.startButtonText}>Start Rehearsing</Text>
            </Pressable>
          )}

          {state === 'my_turn' && (
            <View style={styles.myTurnFooter}>
              {/* Mic/recording status integrated into pill */}
              {mode === 'recording' && isRecording && (
                <View style={styles.statusRow}>
                  <Animated.View style={[styles.recDot, { opacity: recPulseAnim }]} />
                  <Text style={styles.recLabel} numberOfLines={1}>
                    Recording {formatElapsed(durationMillis)}
                  </Text>
                </View>
              )}
              {mode === 'recording' && isUploading && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color={colors.coral} />
                  <Text style={styles.recLabel}>Uploading...</Text>
                </View>
              )}
              {isListening && !(mode === 'recording' && isRecording) && (
                <View style={styles.statusRow}>
                  <Animated.View style={[styles.micDot, { opacity: micPulseAnim }]} />
                  <Text style={styles.micLabel} numberOfLines={1}>
                    {transcript
                      ? `"${transcript.length > 40 ? '...' + transcript.slice(-40) : transcript}"`
                      : 'Listening...'}
                  </Text>
                </View>
              )}
              {!isListening && isSpeechAvailable && speechError && (
                <View style={styles.statusRow}>
                  <Text style={styles.micErrorText}>{TRANSCRIPTION_ERROR_MESSAGES[speechError]}</Text>
                </View>
              )}
              <View style={styles.controlRow}>
                <Pressable style={styles.pauseButton} onPress={handlePause}>
                  <Text style={styles.pauseButtonText}>| |</Text>
                </Pressable>
                {mode === 'practice' && (
                  <Pressable onPress={handleHint}>
                    <Text style={styles.hintButtonText}>Hint</Text>
                  </Pressable>
                )}
                <View style={styles.controlSpacer} />
                <Pressable style={styles.doneButton} onPress={handleAdvance}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </View>
            </View>
          )}

          {state === 'loading' && (
            <View style={styles.controlRow}>
              <Pressable style={styles.pauseButton} onPress={handlePause}>
                <Text style={styles.pauseButtonText}>| |</Text>
              </Pressable>
              <View style={styles.controlSpacer} />
              <Text style={styles.speakingText}>
                {currentLine?.character_name ?? 'Other'} is speaking...
              </Text>
              <View style={styles.controlSpacer} />
            </View>
          )}

          {state === 'playing' && (
            <View style={styles.controlRow}>
              <Pressable style={styles.pauseButton} onPress={handlePause}>
                <Text style={styles.pauseButtonText}>| |</Text>
              </Pressable>
              <View style={styles.controlSpacer} />
              <Text style={styles.speakingText}>
                {currentLine?.character_name ?? 'Other'} is speaking...
              </Text>
              <View style={styles.controlSpacer} />
            </View>
          )}

          {state === 'paused' && (
            <Pressable style={styles.resumeButton} onPress={handleResume}>
              <Text style={styles.resumeButtonText}>Resume</Text>
            </Pressable>
          )}

          {state === 'done' && (
            <Pressable
              style={styles.againButton}
              onPress={() => { setState('idle'); setCurrentLineIndex(0); }}
            >
              <Text style={styles.againButtonText}>Again!</Text>
            </Pressable>
          )}
        </View>
      </View>

      {editingLine && (
        <LineEditor
          line={editingLine}
          visible={!!editingLine}
          onClose={() => setEditingLine(null)}
          onSave={handleSaveLineEdit}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 15,
  },

  // Top bar — transparent floating
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '600',
  },
  sceneName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
  },
  lineCountPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 36,
    alignItems: 'center',
  },
  lineCountPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Mode switcher — small floating pills
  modeSwitcherRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modePillActiveLearning: {
    backgroundColor: colors.rose,
    borderColor: colors.rose,
  },
  modePillTextActiveLearning: {
    color: colors.textInverse,
  },
  modePillActivePractice: {
    backgroundColor: colors.rose,
    borderColor: colors.rose,
  },
  modePillTextActivePractice: {
    color: colors.textInverse,
  },
  modePillActiveRecording: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  modePillTextActiveRecording: {
    color: colors.textInverse,
  },

  // Script area
  scriptScroll: {
    flex: 1,
  },
  scriptContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 16,
  },

  // Line styles — pure editorial, no cards
  lineRowBase: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 3,
  },
  lineRowCurrent: {
    marginVertical: 8,
  },
  lineRowDone: {
    opacity: 0.3,
  },

  // Character names — these carry the visual hierarchy now
  characterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  characterName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.sage,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  characterNameMine: {
    color: colors.rose,
    fontSize: 14,
  },
  characterNameCurrentMine: {
    fontSize: 15,
    letterSpacing: 1.5,
  },
  editedIndicator: {
    fontSize: 10,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  // Line text
  lineText: {
    fontSize: 17,
    color: colors.text,
    lineHeight: 28,
    fontFamily: 'Georgia',
  },
  hiddenLineText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 26,
    fontFamily: 'Georgia',
    fontStyle: 'italic',
  },
  stageDirection: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 4,
  },

  // Floating footer
  footerWrapper: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  footerPill: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadows.lg,
  },

  // Idle state — big CTA
  startButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textInverse,
  },

  // My turn controls
  myTurnFooter: {
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlSpacer: {
    flex: 1,
  },
  pauseButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  doneButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textInverse,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.rose,
  },

  // Mic indicators
  micDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  micLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  micErrorText: {
    fontSize: 12,
    color: colors.coral,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
  },
  recLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.coral,
  },

  // Speaking/loading state
  speakingText: {
    fontSize: 14,
    color: colors.sage,
    fontWeight: '500',
  },

  // Paused state
  resumeButton: {
    backgroundColor: colors.sage,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resumeButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textInverse,
  },

  // Done state
  againButton: {
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  againButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textInverse,
  },

  // Countdown overlay
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(45, 42, 38, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 120,
    fontWeight: '800',
    color: colors.rose,
  },
});
