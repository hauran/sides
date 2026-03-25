import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayStore } from '../../../src/store/usePlayStore';
import { useCoverImage, invalidateCover } from '../../../src/hooks/useCoverImage';
import { PlayEditor } from '../../../src/components/PlayEditor';

export default function PlayEditScreen() {
  const { playId } = useLocalSearchParams<{ playId: string }>();
  const router = useRouter();
  const play = usePlayStore((s) => (playId ? s.plays[playId] : undefined));
  const updatePlay = usePlayStore((s) => s.updatePlay);
  const coverUrl = useCoverImage(playId ?? '', play?.cover_uri ?? null);

  if (!play || !playId) return null;

  return (
    <PlayEditor
      play={play}
      coverUrl={coverUrl}
      onClose={() => router.back()}
      onSaved={(updates) => {
        if (updates.cover_uri) {
          invalidateCover(playId);
        }
        if (updates.title || updates.cover_uri) {
          updatePlay(playId, updates);
        }
        router.back();
      }}
    />
  );
}
