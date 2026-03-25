import { useCallback, useEffect, useRef, useState } from 'react';

let ExpoSpeechRecognitionModule: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule | null = null;

try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
} catch {
  // Native module not available
}

export type TranscriptionError = 'mic-unavailable' | 'not-available' | 'permission-denied' | 'unknown';

export interface UseTranscriptionResult {
  transcript: string;
  isListening: boolean;
  isAvailable: boolean;
  start: () => Promise<void>;
  stop: () => void;
  error: TranscriptionError | null;
}

const MAX_SILENT_RESTARTS = 10;

export function useTranscription(): UseTranscriptionResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<TranscriptionError | null>(null);
  const isAvailable = ExpoSpeechRecognitionModule != null;

  const wantListeningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false);
  const silentRestartCountRef = useRef(0);

  const doStart = useCallback(() => {
    if (!ExpoSpeechRecognitionModule || isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      });
    } catch {
      setError('mic-unavailable');
      isStartingRef.current = false;
      wantListeningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ExpoSpeechRecognitionModule) return;

    const resultListener = ExpoSpeechRecognitionModule.addListener('result', (event: { results: Array<{ transcript: string }> }) => {
      const text = event.results[0]?.transcript ?? '';
      setTranscript(text);
      // Got real speech — reset silent restart counter
      silentRestartCountRef.current = 0;
    });

    const startListener = ExpoSpeechRecognitionModule.addListener('start', () => {
      isStartingRef.current = false;
      setIsListening(true);
      setError(null);
    });

    const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
      isStartingRef.current = false;
      setIsListening(false);

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      if (wantListeningRef.current && silentRestartCountRef.current < MAX_SILENT_RESTARTS) {
        silentRestartCountRef.current++;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current) {
            doStart();
          }
        }, 500);
      }
    });

    const errorListener = ExpoSpeechRecognitionModule.addListener('error', (event: { error: string; message: string }) => {
      if (event.error === 'no-speech') return;
      if (event.message?.includes('avfaudio') || event.message?.includes('560227702')) {
        setError('mic-unavailable');
        wantListeningRef.current = false;
        return;
      }
      setError('unknown');
    });

    return () => {
      resultListener.remove();
      startListener.remove();
      endListener.remove();
      errorListener.remove();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, [doStart]);

  const start = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) {
      setError('not-available');
      return;
    }

    wantListeningRef.current = true;
    silentRestartCountRef.current = 0;
    setTranscript('');
    setError(null);

    try {
      const permResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permResult.granted) {
        setError('permission-denied');
        wantListeningRef.current = false;
        return;
      }
      doStart();
    } catch {
      setError('unknown');
      wantListeningRef.current = false;
    }
  }, [doStart]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    isStartingRef.current = false;
    if (!ExpoSpeechRecognitionModule) return;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore
    }
    setIsListening(false);
  }, []);

  return { transcript, isListening, isAvailable, start, stop, error };
}
