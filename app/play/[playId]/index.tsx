import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActionSheetIOS, Platform, ActivityIndicator } from 'react-native';
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
    user_name: string;
    avatar_uri: string | null;
  }[];
  assignments: {
    character_id: string;
    user_id: string;
    user_name: string;
    avatar_uri: string | null;
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

  const fetchDetail = useCallback(() => {
    if (playId) {
      api<PlayDetail>(`/plays/${playId}`).then(setDetail).catch(console.error);
    }
  }, [playId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  function showCharacterMenu(characterId: string, characterName: string, isAssignedToMe: boolean) {
    const options = isAssignedToMe
      ? ['Change voice', 'Unassign myself', 'Cancel']
      : ['I\'ll play this role', 'Invite someone', 'Change voice', 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: characterName },
        (index) => {
          if (isAssignedToMe) {
            if (index === 0) Alert.alert('Coming soon', 'Voice selection will be available in a future update.');
            if (index === 1) doUnassign(characterId);
          } else {
            if (index === 0) doAssign(characterId);
            if (index === 1) Alert.alert('Coming soon', 'Invite links will be available in a future update.');
            if (index === 2) Alert.alert('Coming soon', 'Voice selection will be available in a future update.');
          }
        }
      );
    } else {
      Alert.alert(characterName, undefined, [
        ...(isAssignedToMe
          ? [
              { text: 'Change voice', onPress: () => Alert.alert('Coming soon', 'Voice selection will be available in a future update.') },
              { text: 'Unassign myself', onPress: () => doUnassign(characterId) },
            ]
          : [
              { text: "I'll play this role", onPress: () => doAssign(characterId) },
              { text: 'Invite someone', onPress: () => Alert.alert('Coming soon', 'Invite links will be available in a future update.') },
              { text: 'Change voice', onPress: () => Alert.alert('Coming soon', 'Voice selection will be available in a future update.') },
            ]),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  function doUnassign(characterId: string) {
    if (!playId || !detail) return;

    // Optimistic: remove assignment immediately
    const prev = detail;
    setDetail({
      ...detail,
      assignments: detail.assignments.filter((a) => a.character_id !== characterId),
    });

    // Fire API in background, revert on failure
    api(`/plays/${playId}/assign/${characterId}`, { method: 'DELETE' }).catch((err) => {
      console.error('Unassign error:', err);
      setDetail(prev);
    });
  }

  function doAssign(characterId: string) {
    if (!playId || !detail || !currentUser) return;

    // Optimistic: add assignment immediately
    const prev = detail;
    const newAssignment = {
      character_id: characterId,
      user_id: currentUser.id,
      user_name: currentUser.name,
      avatar_uri: currentUser.avatar_uri,
    };
    setDetail({
      ...detail,
      assignments: [
        ...detail.assignments.filter((a) => a.character_id !== characterId),
        newAssignment,
      ],
    });

    // Fire API in background, revert on failure
    api(`/plays/${playId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ character_id: characterId }),
    }).catch((err) => {
      console.error('Assign error:', err);
      setDetail(prev);
      Alert.alert('Error', 'Failed to assign character.');
    });
  }

  if (!play) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Play not found.</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#534AB7" />
      </View>
    );
  }

  const characters = detail.characters;
  const scenes = detail.scenes;
  const assignments = detail.assignments;

  const assignmentByCharacter = new Map(
    assignments.map((a) => [a.character_id, a])
  );

  // User can play multiple characters
  const myCharacterIds = assignments
    .filter((a) => a.user_id === currentUser?.id)
    .map((a) => a.character_id);
  const myFirstCharacterId = myCharacterIds[0] ?? '';

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
            const assignment = assignmentByCharacter.get(c.id);
            const isMe = assignment?.user_id === currentUser?.id;
            return (
              <View key={c.id} style={[styles.characterRow, isMe && styles.characterRowMine]}>
                <View style={styles.characterInfo}>
                  <Text style={styles.characterName}>{c.name}</Text>
                  {isMe ? (
                    <Text style={styles.assignedMe}>You</Text>
                  ) : assignment ? (
                    <Text style={styles.assignedName}>{assignment.user_name}</Text>
                  ) : (
                    <Text style={styles.unassigned}>Not yet assigned</Text>
                  )}
                </View>
                <View style={styles.characterRight}>
                  {assignment && (
                    <View style={[styles.avatar, isMe && styles.avatarMine]}>
                      <Text style={styles.avatarText}>
                        {getInitials(isMe ? (currentUser?.name ?? 'ME') : assignment.user_name)}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    style={styles.kebab}
                    onPress={() => showCharacterMenu(c.id, c.name, isMe)}
                    hitSlop={12}
                  >
                    <Text style={styles.kebabText}>···</Text>
                  </Pressable>
                </View>
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
              onPress={() => router.push(`/rehearse/${scene.id}?characterIds=${myCharacterIds.join(',')}`)}
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
  characterRowMine: {
    backgroundColor: '#F0EDFF',
    borderWidth: 2,
    borderColor: '#534AB7',
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
  assignedMe: {
    fontSize: 13,
    color: '#534AB7',
    fontWeight: '600',
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
  avatarMine: {
    backgroundColor: '#EF9F27',
  },
  characterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kebab: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  kebabText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#534AB7',
    letterSpacing: 1,
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
