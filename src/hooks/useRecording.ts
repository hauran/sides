import { useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync } from 'expo-audio';

export function useRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);

  async function startRecording() {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording(): Promise<string | null> {
    await recorder.stop();
    // Restore playback mode so TTS can play
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    return recorder.uri;
  }

  return {
    recorder,
    startRecording,
    stopRecording,
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
  };
}
