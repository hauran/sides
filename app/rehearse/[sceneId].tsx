import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, shadows, typography } from '../../src/lib/theme';
import { useSceneStore } from '../../src/store/useSceneStore';
import { useBookmarkStore } from '../../src/store/useBookmarkStore';
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
  const { sceneId, characterIds: characterIdsParam, scrollToLine, scrollToLast } = useLocalSearchParams<{
    sceneId: string;
    characterIds: string;
    scrollToLine: string;
    scrollToLast: string;
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
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [playScenes, setPlayScenes] = useState<{ id: string; name: string; sort: number }[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [hintLevel, setHintLevel] = useState(0); // 0 = hidden, 1+ = words revealed
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [hideStageDirections, setHideStageDirections] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [contextMenuLine, setContextMenuLine] = useState<Line | null>(null);
  const [contextMenuY, setContextMenuY] = useState(0);
  const scrollOffsetRef = useRef(0);
  const scrollTopRef = useRef(0);
  const [showCueLines, setShowCueLines] = useState(false);
  const [showBookmarksModal, setShowBookmarksModal] = useState(false);
  const [navFlashIndex, setNavFlashIndex] = useState<number | null>(null);
  const navFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micPulseAnim = useRef(new Animated.Value(0.4)).current;

  // Recording mode state
  const { startRecording, stopRecording, isRecording, durationMillis } = useRecording();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const recordingActiveRef = useRef(false);
  const recPulseAnim = useRef(new Animated.Value(1)).current;
  const addRecording = useCastStore((s) => s.addRecording);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const fetchBookmarks = useBookmarkStore((s) => s.fetchBookmarks);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);

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
          .then((s) => {
            useSceneStore.getState().setScene(s);
            // Fetch characters, scenes, and bookmarks for the play
            api<{ id: string; name: string }[]>(`/plays/${s.play_id}/characters`)
              .then(setCharacters)
              .catch(console.error);
            api<{ id: string; name: string; sort: number }[]>(`/plays/${s.play_id}/scenes`)
              .then(setPlayScenes)
              .catch(console.error);
            fetchBookmarks(s.play_id);
          }),
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (navFlashTimer.current) clearTimeout(navFlashTimer.current);
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

  // Scroll to a specific line on mount (from bookmark or cross-scene nav)
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!linesLoaded || didInitialScroll.current) return;
    if (!scrollToLine && !scrollToLast) return;

    // Find target index
    let targetIdx = -1;
    if (scrollToLine) {
      targetIdx = lines.findIndex((l) => l.id === scrollToLine);
    } else if (scrollToLast) {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (isMyLine(lines[i]) && !lines[i].hidden) { targetIdx = i; break; }
      }
    }
    if (targetIdx < 0) { didInitialScroll.current = true; return; }

    // Delay to let onLayout fire for line refs
    const timer = setTimeout(() => {
      flashAndScrollTo(targetIdx);
      didInitialScroll.current = true;
    }, 500);
    return () => clearTimeout(timer);
  }, [linesLoaded, lines]);

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

    // Skip TTS for stage directions and hidden/skipped lines
    if (line.type === 'stage_direction' || line.hidden) {
      advanceFrom(index);
      return;
    }

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
    const ids = line.character_ids?.length ? line.character_ids : (line.character_id ? [line.character_id] : []);
    return ids.some(id => myCharacterIds.has(id));
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

  function handleKebabMenu() {
    setShowMenu(prev => !prev);
  }

  function handleLongPressLine(index: number) {
    if (state !== 'idle' && state !== 'paused' && state !== 'my_turn') return;
    const line = lines[index];
    if (!line) return;
    const layoutY = lineRefs.current[line.id] ?? 0;
    setContextMenuY(layoutY - scrollOffsetRef.current + scrollTopRef.current);
    setContextMenuLine(line);
  }

  async function handleSaveLineEdit(lineId: string, updates: { text?: string; character_ids?: string[] }) {
    const line = editingLine;
    await api<Line>(`/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const storeUpdates: Partial<Line> = { edited: true };
    if (updates.text) storeUpdates.text = updates.text;
    if (updates.character_ids) {
      storeUpdates.character_ids = updates.character_ids;
      storeUpdates.character_id = updates.character_ids[0] ?? null;
      const names = updates.character_ids.map(id => characters.find(c => c.id === id)?.name).filter(Boolean);
      storeUpdates.character_name = names.length > 0 ? names.join(' / ') : null;
    }
    useSceneStore.getState().updateLine(lineId, storeUpdates);
    if (updates.text && line?.character_name) {
      try {
        await api(`/tts/cache?character=${encodeURIComponent(line.character_name)}&text=${encodeURIComponent(line.text)}`, {
          method: 'DELETE',
        });
      } catch { /* Non-critical */ }
    }
  }

  function handleResume() {
    const line = lines[currentLineIndex];
    if (!line) return;
    activateLine(currentLineIndex);
  }

  // Next/Prev navigation among user's lines (cross-scene)
  function handlePrevLine() {
    for (let i = currentLineIndex - 1; i >= 0; i--) {
      if (isMyLine(lines[i]) && !lines[i].hidden) {
        flashAndScrollTo(i);
        return;
      }
    }
    // Jump to previous scene
    if (currentSceneIndex <= 0) return;
    const prevScene = playScenes[currentSceneIndex - 1];
    if (prevScene) {
      router.replace(`/rehearse/${prevScene.id}?characterIds=${characterIdsParam ?? ''}&scrollToLast=1`);
    }
  }

  function handleNextLine() {
    for (let i = currentLineIndex + 1; i < lines.length; i++) {
      if (isMyLine(lines[i]) && !lines[i].hidden) {
        flashAndScrollTo(i);
        return;
      }
    }
    // Jump to next scene
    if (currentSceneIndex < 0 || currentSceneIndex >= playScenes.length - 1) return;
    const nextScene = playScenes[currentSceneIndex + 1];
    if (nextScene) {
      router.replace(`/rehearse/${nextScene.id}?characterIds=${characterIdsParam ?? ''}`);
    }
  }

  function flashAndScrollTo(index: number) {
    setCurrentLineIndex(index);
    if (navFlashTimer.current) clearTimeout(navFlashTimer.current);
    setNavFlashIndex(index);
    const y = lineRefs.current[lines[index]?.id];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
    }
    navFlashTimer.current = setTimeout(() => {
      setNavFlashIndex(null);
    }, 3000);
  }

  // Toggle bookmark
  function handleToggleBookmark(lineId: string) {
    if (lineId in bookmarks) {
      removeBookmark(lineId);
    } else {
      addBookmark(lineId);
    }
  }

  // Toggle hidden/skip
  async function handleToggleHidden(line: Line) {
    const newHidden = !line.hidden;
    // Optimistic update
    useSceneStore.getState().updateLine(line.id, { hidden: newHidden });
    try {
      await api(`/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ hidden: newHidden }),
      });
    } catch (err) {
      // Revert on failure
      useSceneStore.getState().updateLine(line.id, { hidden: !newHidden });
      console.error('Failed to toggle hidden:', err);
    }
  }

  // Compute cue line IDs
  const cueLineIds = useMemo(() => {
    if (!showCueLines) return new Set<string>();
    const ids = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      if (isMyLine(lines[i]) && lines[i].type === 'dialogue') {
        const prev = lines[i - 1];
        if (prev && !isMyLine(prev)) {
          ids.add(prev.id);
        }
      }
    }
    return ids;
  }, [lines, showCueLines, myCharacterIds]);

  const currentSceneIndex = useMemo(
    () => playScenes.findIndex((s) => s.id === sceneId),
    [playScenes, sceneId]
  );

  // Check if prev/next exist (including cross-scene)
  const hasPrevLine = useMemo(() => {
    for (let i = currentLineIndex - 1; i >= 0; i--) {
      if (isMyLine(lines[i]) && !lines[i].hidden) return true;
    }
    return currentSceneIndex > 0;
  }, [currentLineIndex, lines, myCharacterIds, currentSceneIndex]);

  const hasNextLine = useMemo(() => {
    for (let i = currentLineIndex + 1; i < lines.length; i++) {
      if (isMyLine(lines[i]) && !lines[i].hidden) return true;
    }
    return currentSceneIndex >= 0 && currentSceneIndex < playScenes.length - 1;
  }, [currentLineIndex, lines, myCharacterIds, currentSceneIndex, playScenes.length]);

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
    const isCue = cueLineIds.has(line.id);
    const isHidden = line.hidden;

    const base: any[] = [styles.lineRowBase];
    if (isPast) base.push(styles.lineRowDone);
    if (isCurrent) base.push(styles.lineRowCurrent);
    if (isCue) base.push(styles.lineRowCue);
    if (isHidden) base.push(styles.lineRowHidden);
    if (navFlashIndex === index) base.push(styles.lineRowFlash);
    return base;
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
      {/* Floating top bar */}
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
        <Pressable style={styles.kebabButton} onPress={handleKebabMenu} hitSlop={12}>
          <Text style={styles.kebabText}>···</Text>
        </Pressable>
      </View>

      {/* Popover menu */}
      {showMenu && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)} />
          <View style={styles.menuPopover}>
            <Pressable
              style={styles.menuItem}
              onPress={() => { setHideStageDirections(prev => !prev); setShowMenu(false); }}
            >
              <Text style={styles.menuItemText}>
                {hideStageDirections ? 'Show Stage Directions' : 'Hide Stage Directions'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => { setShowCueLines(prev => !prev); setShowMenu(false); }}
            >
              <Text style={styles.menuItemText}>
                {showCueLines ? 'Hide Cue Lines' : 'Show Cue Lines'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => { setShowBookmarksModal(true); setShowMenu(false); }}
            >
              <Text style={styles.menuItemText}>Bookmarks</Text>
            </Pressable>
          </View>
        </>
      )}

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
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        onLayout={(e) => { scrollTopRef.current = e.nativeEvent.layout.y; }}
      >
        {lines.map((line, index) => {
          if (hideStageDirections && line.type === 'stage_direction') return null;
          const isBookmarked = line.id in bookmarks;

          return (
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
              <View style={styles.lineRow}>
                <View style={styles.lineContent}>
                  {(line.character_ids?.length > 0 || line.character_id) ? (
                    <>
                      <View style={styles.lineMetaRow}>
                        {line.edited && (
                          <Text style={styles.editedIndicator}>edited</Text>
                        )}
                        {line.hidden && (
                          <Text style={styles.skippedIndicator}>skipped</Text>
                        )}
                      </View>
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
                        : <Text style={[styles.lineText, line.hidden && styles.lineTextHidden]}>
                            {line.text}
                          </Text>
                      }
                    </>
                  ) : (
                    <Text style={[styles.stageDirection, line.hidden && styles.lineTextHidden]}>
                      {line.text}
                    </Text>
                  )}
                </View>
                {/* Bookmark indicator */}
                <Pressable
                  style={styles.bookmarkTouchable}
                  onPress={() => handleToggleBookmark(line.id)}
                  hitSlop={8}
                >
                  <Text style={isBookmarked ? styles.bookmarkFilled : styles.bookmarkOutline}>
                    {isBookmarked ? '\u2605' : '\u2606'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
          );
        })}
      </ScrollView>

      {/* Floating footer pill */}
      <View style={styles.footerWrapper}>
        <View style={styles.footerRow}>
          <Pressable
            style={styles.footerNavButton}
            onPress={handlePrevLine}
            disabled={!hasPrevLine}
            hitSlop={8}
          >
            <Text style={[styles.footerNavText, !hasPrevLine && styles.footerNavDisabled]}>{'\u2039'}</Text>
          </Pressable>
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
                <Text style={styles.speakingText} numberOfLines={1}>
                  {currentLine?.character_name ?? 'Other'} is speaking...
                </Text>
              </View>
            )}

            {state === 'playing' && (
              <View style={styles.controlRow}>
                <Pressable style={styles.pauseButton} onPress={handlePause}>
                  <Text style={styles.pauseButtonText}>| |</Text>
                </Pressable>
                <Text style={styles.speakingText} numberOfLines={1}>
                  {currentLine?.character_name ?? 'Other'} is speaking...
                </Text>
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
          <Pressable
            style={styles.footerNavButton}
            onPress={handleNextLine}
            disabled={!hasNextLine}
            hitSlop={8}
          >
            <Text style={[styles.footerNavText, !hasNextLine && styles.footerNavDisabled]}>{'\u203A'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Context menu */}
      {contextMenuLine && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setContextMenuLine(null)} />
          <View style={[styles.contextMenu, { top: Math.max(60, Math.min(contextMenuY, 600)) }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setEditingLine(contextMenuLine);
                setContextMenuLine(null);
              }}
            >
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                handleToggleBookmark(contextMenuLine.id);
                setContextMenuLine(null);
              }}
            >
              <Text style={styles.menuItemText}>
                {contextMenuLine.id in bookmarks ? 'Remove Bookmark' : 'Bookmark'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                handleToggleHidden(contextMenuLine);
                setContextMenuLine(null);
              }}
            >
              <Text style={styles.menuItemText}>
                {contextMenuLine.hidden ? 'Unskip' : 'Skip'}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Bookmarks modal */}
      <Modal visible={showBookmarksModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bookmarks</Text>
              <Pressable onPress={() => setShowBookmarksModal(false)}>
                <Text style={styles.modalClose}>{'\u2715'}</Text>
              </Pressable>
            </View>
            <ScrollView>
              {(() => {
                const sceneBookmarks = lines.filter((l) => l.id in bookmarks);
                if (sceneBookmarks.length === 0) {
                  return <Text style={styles.emptyBookmarks}>No bookmarks in this scene</Text>;
                }
                return sceneBookmarks.map((line) => (
                  <Pressable
                    key={line.id}
                    style={styles.bookmarkModalItem}
                    onPress={() => {
                      setShowBookmarksModal(false);
                      const y = lineRefs.current[line.id];
                      if (y !== undefined) {
                        scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
                      }
                    }}
                  >
                    <Text style={styles.bookmarkModalChar}>{line.character_name ?? 'Stage Direction'}</Text>
                    <Text style={styles.bookmarkModalText} numberOfLines={2}>{line.text}</Text>
                  </Pressable>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {editingLine && (
        <LineEditor
          line={editingLine}
          characters={characters}
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
  kebabButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kebabText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  menuPopover: {
    position: 'absolute',
    top: 52,
    right: 16,
    zIndex: 51,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    minWidth: 200,
    ...shadows.lg,
  },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text,
  },
  sceneName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
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
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  lineRowDone: {
    opacity: 0.3,
  },
  lineRowCue: {
    borderLeftWidth: 4,
    borderLeftColor: colors.honey,
    paddingLeft: 8,
  },
  lineRowHidden: {
    opacity: 0.3,
  },
  lineRowFlash: {
    backgroundColor: colors.roseSoft,
    borderRadius: radii.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  lineContent: {
    flex: 1,
  },
  lineMetaRow: {
    flexDirection: 'row',
    gap: 6,
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
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  skippedIndicator: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.coral,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  lineTextHidden: {
    textDecorationLine: 'line-through',
  },
  bookmarkTouchable: {
    paddingLeft: 8,
    paddingTop: 2,
  },
  bookmarkFilled: {
    fontSize: 16,
    color: colors.honey,
  },
  bookmarkOutline: {
    fontSize: 16,
    color: colors.border,
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
    paddingHorizontal: 12,
  },
  footerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerNavButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  footerNavText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.rose,
    marginTop: -2,
  },
  footerNavDisabled: {
    color: colors.border,
  },
  footerPill: {
    flex: 1,
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
    flex: 1,
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

  // Context menu
  contextMenu: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    zIndex: 51,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    ...shadows.lg,
  },

  // Bookmarks modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 42, 38, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '60%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.heading,
  },
  modalClose: {
    fontSize: 20,
    color: colors.textSecondary,
    padding: 4,
  },
  emptyBookmarks: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
    fontStyle: 'italic',
  },
  bookmarkModalItem: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bookmarkModalChar: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.honey,
    marginBottom: 2,
  },
  bookmarkModalText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: 'Georgia',
    lineHeight: 20,
  },
});
