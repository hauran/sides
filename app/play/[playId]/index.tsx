import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayStore } from '../../../src/store/usePlayStore';
import { useUserStore } from '../../../src/store/useUserStore';
import { api } from '../../../src/lib/api';

interface PlayDetail {
  id: string;
  title: string;
  script_type: string;
  characters: { id: string; name: string }[];
  scenes: { id: string; name: string; sort: number }[];
  members: {
    user_id: string;
    character_id: string | null;
    user_name: string;
    avatar_uri: string | null;
    character_name: string | null;
  }[];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function PlayDetailScreen() {
  const { playId } = useLocalSearchParams<{ playId: string }>();
  const router = useRouter();
  const play = usePlayStore((s) => (playId ? s.plays[playId] : undefined));
  const currentUser = useUserStore((s) => s.currentUser);
  const [detail, setDetail] = useState<PlayDetail | null>(null);

  useEffect(() => {
    if (playId) {
      api<PlayDetail>(`/plays/${playId}`).then(setDetail).catch(console.error);
    }
  }, [playId]);

  if (!play) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Play not found.</Text>
      </View>
    );
  }

  const characters = detail?.characters ?? [];
  const scenes = detail?.scenes ?? [];
  const members = detail?.members ?? [];

  const memberByCharacter = new Map(
    members.filter((m) => m.character_id).map((m) => [m.character_id, m])
  );

  const myMember = members.find((m) => m.user_id === currentUser?.id);
  const myCharacterId = myMember?.character_id ?? '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{play.title}</Text>
      <Text style={styles.meta}>{play.script_type.toUpperCase()} script</Text>

      <Text style={styles.sectionTitle}>Characters</Text>
      {characters.length === 0 ? (
        <Text style={styles.emptyText}>No characters parsed yet.</Text>
      ) : (
        <View style={styles.list}>
          {characters.map((c) => {
            const member = memberByCharacter.get(c.id);
            return (
              <View key={c.id} style={styles.characterRow}>
                <View style={styles.characterInfo}>
                  <Text style={styles.characterName}>{c.name}</Text>
                  {member ? (
                    <Text style={styles.assignedName}>{member.user_name}</Text>
                  ) : (
                    <Text style={styles.unassigned}>Invite someone</Text>
                  )}
                </View>
                {member ? (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {getInitials(member.user_name)}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.avatar, styles.avatarInvite]}>
                    <Text style={styles.avatarInviteText}>+</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>Scenes</Text>
      {scenes.length === 0 ? (
        <Text style={styles.emptyText}>No scenes parsed yet.</Text>
      ) : (
        <View style={styles.list}>
          {scenes.map((scene) => (
            <Pressable
              key={scene.id}
              style={styles.sceneCard}
              onPress={() => router.push(`/rehearse/${scene.id}?characterId=${myCharacterId}`)}
            >
              <Text style={styles.sceneName}>{scene.name}</Text>
              <Text style={styles.sceneArrow}>{'\u203A'}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  meta: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#534AB7',
    marginBottom: 12,
    marginTop: 8,
  },
  list: {
    gap: 8,
    marginBottom: 20,
  },
  characterRow: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  characterInfo: {
    flex: 1,
    gap: 2,
  },
  characterName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  assignedName: {
    fontSize: 13,
    color: '#534AB7',
  },
  unassigned: {
    fontSize: 13,
    color: '#BBBBBB',
    fontStyle: 'italic',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#534AB7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarInvite: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#534AB7',
    borderStyle: 'dashed',
  },
  avatarInviteText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#534AB7',
  },
  sceneCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sceneName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A2E',
    flex: 1,
  },
  sceneArrow: {
    fontSize: 22,
    color: '#534AB7',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 17,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 40,
  },
});
