import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { ActivityIndicator } from 'react-native';
import { useSceneStore } from '../../src/store/useSceneStore';
import { DEV_USER_ID, api, setDevUserId, uploadRecording } from '../../src/lib/api';
import { createLineSpeaker } from '../../src/lib/tts';
import { useTranscription, TranscriptionError } from '../../src/hooks/useTranscription';
import { useRecording } from '../../src/hooks/useRecording';
import { isLineMatch } from '../../src/lib/matchLine';
import { useCastStore } from '../../src/store/useCastStore';
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
    const isMine = isMyLine(line);
    const active = state !== 'idle';
    const isCurrent = index === currentLineIndex && active;
    const isPast = active && index < currentLineIndex;

    if (isCurrent && state === 'my_turn' && mode === 'recording') return [styles.lineRowBase, styles.lineRowRecording];
    if (isCurrent && state === 'my_turn') return [styles.lineRowBase, styles.lineRowMyTurn];
    if (isCurrent && state === 'paused') return [styles.lineRowBase, styles.lineRowPaused];
    if (isCurrent && (state === 'playing' || state === 'loading')) return [styles.lineRowBase, styles.lineRowPlaying];
    if (isPast) return [styles.lineRowBase, styles.lineRowDone];
    if (isMine) return [styles.lineRowBase, styles.lineRowMine];
    return styles.lineRowBase;
  }

  if (!linesLoaded) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#534AB7" />
        <Text style={styles.loadingText}>Loading script...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.flex}>
            <Text style={styles.title}>{scene?.name ?? 'Rehearsal'}</Text>
            <Text style={styles.lineCount}>
              {state === 'idle'
                ? `${lines.length} lines — tap a line to start`
                : state === 'done'
                ? 'Scene complete!'
                : state === 'paused'
                ? `Paused — line ${currentLineIndex + 1} of ${lines.length}`
                : `Line ${currentLineIndex + 1} of ${lines.length}`}
            </Text>
          </View>
          <Pressable onPress={() => { stopCurrentAudio(); stopListening(); router.back(); }} style={styles.closeX}>
            <Text style={styles.closeXText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.modeSwitcher}>
          <Pressable
            style={[styles.modeButton, mode === 'learning' && styles.modeButtonActive]}
            onPress={() => setMode('learning')}
          >
            <Text style={[styles.modeButtonText, mode === 'learning' && styles.modeButtonTextActive]}>Learning</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'practice' && styles.modeButtonActive]}
            onPress={() => setMode('practice')}
          >
            <Text style={[styles.modeButtonText, mode === 'practice' && styles.modeButtonTextActive]}>Practice</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'recording' && styles.modeButtonActiveRecording]}
            onPress={() => setMode('recording')}
          >
            <Text style={[styles.modeButtonText, mode === 'recording' && styles.modeButtonTextActiveRecording]}>Recording</Text>
          </Pressable>
        </View>
      </View>

      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scriptScroll}
        contentContainerStyle={styles.scriptContent}
      >
        {lines.map((line, index) => (
          <Pressable
            key={line.id}
            onPress={() => handleTapLine(index)}
            onLayout={(e) => {
              lineRefs.current[line.id] = e.nativeEvent.layout.y;
            }}
          >
            <Animated.View
              style={[
                getLineStyle(line, index),
                index === currentLineIndex && state === 'my_turn' && mode !== 'recording'
                  ? { opacity: pulseAnim }
                  : null,
              ]}
            >
              {line.character_id ? (
                <>
                  <Text
                    style={[
                      styles.characterName,
                      isMyLine(line) && styles.characterNameMine,
                    ]}
                  >
                    {line.character_name ?? 'UNKNOWN'}
                  </Text>
                  {shouldHideLine(line, index)
                    ? <Text style={styles.hiddenLineText}>
                        {index === currentLineIndex && state === 'my_turn' ? getHintText() : '• • •'}
                      </Text>
                    : <Text style={styles.lineText}>{line.text}</Text>
                  }
                </>
              ) : (
                <Text style={styles.stageDirection}>[{line.text}]</Text>
              )}
            </Animated.View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {state === 'idle' && (
          <View style={styles.idleHint}>
            <Text style={styles.idleHintText}>Tap any line to start rehearsing</Text>
          </View>
        )}
        {state === 'my_turn' && (
          <View style={styles.myTurnFooter}>
            {/* Recording indicator */}
            {mode === 'recording' && isRecording && (
              <View style={styles.micRow}>
                <Animated.View style={[styles.recDot, { opacity: recPulseAnim }]} />
                <Text style={styles.recLabel}>
                  Recording... {formatElapsed(durationMillis)}
                </Text>
              </View>
            )}
            {mode === 'recording' && isUploading && (
              <View style={styles.micRow}>
                <ActivityIndicator size="small" color="#E53935" />
                <Text style={styles.recLabel}>Uploading...</Text>
              </View>
            )}
            {isListening && (
              <View style={styles.micRow}>
                <Animated.View style={[styles.micDot, { opacity: micPulseAnim }]} />
                <Text style={styles.micLabel} numberOfLines={1}>
                  {transcript
                    ? `"${transcript.length > 50 ? '...' + transcript.slice(-50) : transcript}"`
                    : 'Listening...'}
                </Text>
              </View>
            )}
            {!isListening && isSpeechAvailable && speechError && (
              <View style={styles.micRow}>
                <Text style={styles.micErrorText}>{TRANSCRIPTION_ERROR_MESSAGES[speechError]}</Text>
              </View>
            )}
            <View style={styles.footerRow}>
              <Pressable style={styles.pauseButton} onPress={handlePause}>
                <Text style={styles.pauseButtonText}>⏸</Text>
              </Pressable>
              {mode === 'practice' && (
                <Pressable style={styles.hintButton} onPress={handleHint}>
                  <Text style={styles.hintButtonText}>Hint</Text>
                </Pressable>
              )}
              <Pressable style={[styles.advanceButton, styles.flex]} onPress={handleAdvance}>
                <Text style={styles.advanceButtonText}>Done — Next Line</Text>
              </Pressable>
            </View>
          </View>
        )}
        {state === 'loading' && (
          <View style={styles.footerRow}>
            <Pressable style={styles.pauseButton} onPress={handlePause}>
              <Text style={styles.pauseButtonText}>⏸</Text>
            </Pressable>
            <View style={[styles.listeningBar, styles.flex]}>
              <Text style={styles.listeningText}>
                Loading {currentLine?.character_name ?? 'other'}'s line...
              </Text>
            </View>
          </View>
        )}
        {state === 'playing' && (
          <View style={styles.footerRow}>
            <Pressable style={styles.pauseButton} onPress={handlePause}>
              <Text style={styles.pauseButtonText}>⏸</Text>
            </Pressable>
            <View style={[styles.listeningBar, styles.flex]}>
              <Text style={styles.listeningText}>
                {currentLine?.character_name ?? 'Other'} is speaking...
              </Text>
            </View>
          </View>
        )}
        {state === 'paused' && (
          <Pressable style={styles.playButton} onPress={handleResume}>
            <Text style={styles.playButtonIcon}>▶</Text>
            <Text style={styles.playButtonText}>Resume</Text>
          </Pressable>
        )}
        {state === 'done' && (
          <Pressable style={styles.playButton} onPress={() => { setState('idle'); setCurrentLineIndex(0); }}>
            <Text style={styles.playButtonText}>Rehearse Again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#999999',
    fontSize: 15,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEDFE',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 2,
  },
  lineCount: {
    fontSize: 13,
    color: '#999999',
  },
  closeX: {
    padding: 4,
    marginLeft: 12,
  },
  closeXText: {
    fontSize: 18,
    color: '#999999',
    fontWeight: '600',
  },
  scriptScroll: {
    flex: 1,
  },
  scriptContent: {
    padding: 20,
    gap: 12,
    paddingBottom: 40,
  },
  lineRowBase: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  lineRowMine: {
    backgroundColor: '#F8F7FF',
  },
  lineRowPlaying: {
    backgroundColor: '#EEEDFE',
    borderLeftWidth: 3,
    borderLeftColor: '#534AB7',
  },
  lineRowMyTurn: {
    backgroundColor: '#FFF8ED',
    borderLeftWidth: 3,
    borderLeftColor: '#EF9F27',
  },
  lineRowRecording: {
    backgroundColor: '#FFF0F0',
    borderLeftWidth: 3,
    borderLeftColor: '#E53935',
  },
  lineRowPaused: {
    backgroundColor: '#F5F5F5',
    borderLeftWidth: 3,
    borderLeftColor: '#999999',
  },
  lineRowDone: {
    opacity: 0.4,
  },
  characterName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#534AB7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  characterNameMine: {
    color: '#EF9F27',
  },
  lineText: {
    fontSize: 16,
    color: '#1A1A2E',
    lineHeight: 24,
    fontFamily: 'Georgia',
  },
  stageDirection: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEDFE',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  idleHint: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  idleHintText: {
    fontSize: 15,
    color: '#999999',
  },
  pauseButton: {
    width: 52,
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButtonText: {
    fontSize: 20,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#534AB7',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  playButtonIcon: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  playButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  advanceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF9F27',
    borderRadius: 12,
    paddingVertical: 16,
  },
  advanceButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listeningBar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    paddingVertical: 16,
  },
  listeningText: {
    fontSize: 15,
    color: '#534AB7',
    fontWeight: '500',
  },
  myTurnFooter: {
    gap: 8,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  micDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53935',
  },
  micLabel: {
    flex: 1,
    fontSize: 13,
    color: '#999999',
    fontStyle: 'italic',
  },
  micErrorText: {
    fontSize: 12,
    color: '#E53935',
  },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E53935',
  },
  recLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E53935',
  },
  modeSwitcher: {
    flexDirection: 'row',
    marginTop: 8,
    backgroundColor: '#F5F4FE',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  modeButtonActiveRecording: {
    backgroundColor: '#FFF0F0',
    shadowColor: '#E53935',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
  },
  modeButtonTextActive: {
    color: '#534AB7',
  },
  modeButtonTextActiveRecording: {
    color: '#E53935',
  },
  hiddenLineText: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
    fontFamily: 'Georgia',
    fontStyle: 'italic',
  },
  hintButton: {
    width: 60,
    backgroundColor: '#F5F4FE',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEEDFE',
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#534AB7',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 96,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
