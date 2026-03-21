import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { useSceneStore } from '../../src/store/useSceneStore';
import { createLineSpeaker, setTtsDevUserId } from '../../src/lib/tts';
import type { Line } from '../../src/types';

const DEV_USER_ID = 'a9dfc43f-eb47-4822-8348-62b5e77af5a5';

type RehearsalState = 'idle' | 'loading' | 'playing' | 'my_turn' | 'done';

export default function RehearsalScreen() {
  const { sceneId, characterId } = useLocalSearchParams<{
    sceneId: string;
    characterId: string;
  }>();
  const router = useRouter();
  const scenes = useSceneStore((s) => s.scenes);
  const scene = sceneId ? scenes[sceneId] : undefined;
  const fetchLines = useSceneStore((s) => s.fetchLines);
  const getLinesForScene = useSceneStore((s) => s.getLinesForScene);
  const scrollRef = useRef<ScrollView>(null);
  const lineRefs = useRef<Record<string, number>>({});
  const currentPlayer = useRef<AudioPlayer | null>(null);

  const [state, setState] = useState<RehearsalState>('idle');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setTtsDevUserId(DEV_USER_ID);
    if (sceneId) fetchLines(sceneId);

    return () => {
      currentPlayer.current?.remove();
    };
  }, [sceneId]);

  const lines = sceneId ? getLinesForScene(sceneId) : [];
  const currentLine = lines[currentLineIndex] as Line | undefined;

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

  function stopCurrentAudio() {
    if (currentPlayer.current) {
      currentPlayer.current.remove();
      currentPlayer.current = null;
    }
  }

  function playOtherLine(index: number) {
    const line = lines[index];
    if (!line) return;

    setState('loading');
    try {
      const player = createLineSpeaker(line.text, line.character_name ?? 'DEFAULT');
      currentPlayer.current = player;

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.playing) {
          setState('playing');
        }
        if (status.didJustFinish) {
          player.remove();
          currentPlayer.current = null;
          advanceFrom(index);
        }
      });

      player.play();
    } catch (err) {
      console.error('TTS playback error:', err);
      setTimeout(() => advanceFrom(index), 2000);
    }
  }

  function startRehearsal() {
    setCurrentLineIndex(0);
    const firstLine = lines[0];
    if (firstLine?.character_id === characterId) {
      setState('my_turn');
    } else {
      playOtherLine(0);
    }
  }

  function advanceFrom(index: number) {
    const nextIndex = index + 1;
    if (nextIndex >= lines.length) {
      setState('done');
      return;
    }
    setCurrentLineIndex(nextIndex);
    const nextLine = lines[nextIndex];
    if (nextLine.character_id === characterId) {
      setState('my_turn');
    } else {
      playOtherLine(nextIndex);
    }
  }

  function handleAdvance() {
    stopCurrentAudio();
    advanceFrom(currentLineIndex);
  }

  function handleTapLine(index: number) {
    if (state === 'idle' || state === 'done') return;
    stopCurrentAudio();
    setCurrentLineIndex(index);
    const line = lines[index];
    if (line.character_id === characterId) {
      setState('my_turn');
    } else {
      playOtherLine(index);
    }
  }

  function getLineStyle(line: Line, index: number) {
    const isMine = line.character_id === characterId;
    const isCurrent = index === currentLineIndex && state !== 'idle';
    const isPast = state !== 'idle' && index < currentLineIndex;

    if (isCurrent && state === 'my_turn') return styles.lineRowMyTurn;
    if (isCurrent && (state === 'playing' || state === 'loading')) return styles.lineRowPlaying;
    if (isPast) return styles.lineRowDone;
    if (isMine) return styles.lineRowMine;
    return styles.lineRow;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{scene?.name ?? 'Rehearsal'}</Text>
            <Text style={styles.lineCount}>
              {state === 'idle'
                ? `${lines.length} lines`
                : state === 'done'
                ? 'Scene complete!'
                : `Line ${currentLineIndex + 1} of ${lines.length}`}
            </Text>
          </View>
          <Pressable onPress={() => { stopCurrentAudio(); router.back(); }} style={styles.closeX}>
            <Text style={styles.closeXText}>✕</Text>
          </Pressable>
        </View>
      </View>

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
                index === currentLineIndex && state === 'my_turn'
                  ? { opacity: pulseAnim }
                  : null,
              ]}
            >
              {line.character_id ? (
                <>
                  <Text
                    style={[
                      styles.characterName,
                      line.character_id === characterId && styles.characterNameMine,
                    ]}
                  >
                    {line.character_name ?? 'UNKNOWN'}
                  </Text>
                  <Text style={styles.lineText}>{line.text}</Text>
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
          <Pressable style={styles.playButton} onPress={startRehearsal}>
            <Text style={styles.playButtonIcon}>▶</Text>
            <Text style={styles.playButtonText}>Start Rehearsal</Text>
          </Pressable>
        )}
        {state === 'my_turn' && (
          <Pressable style={styles.advanceButton} onPress={handleAdvance}>
            <Text style={styles.advanceButtonText}>Done — Next Line</Text>
          </Pressable>
        )}
        {state === 'loading' && (
          <View style={styles.listeningBar}>
            <Text style={styles.listeningText}>
              Loading {currentLine?.character_name ?? 'other'}'s line...
            </Text>
          </View>
        )}
        {state === 'playing' && (
          <View style={styles.listeningBar}>
            <Text style={styles.listeningText}>
              🔊 {currentLine?.character_name ?? 'Other'} is speaking...
            </Text>
          </View>
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
  lineRow: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  lineRowMine: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#F8F7FF',
  },
  lineRowPlaying: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#EEEDFE',
    borderLeftWidth: 3,
    borderLeftColor: '#534AB7',
  },
  lineRowMyTurn: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#FFF8ED',
    borderLeftWidth: 3,
    borderLeftColor: '#EF9F27',
  },
  lineRowDone: {
    padding: 12,
    borderRadius: 8,
    gap: 4,
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
});
