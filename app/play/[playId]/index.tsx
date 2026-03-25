import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlayStore } from '../../../src/store/usePlayStore';
import { useUserStore } from '../../../src/store/useUserStore';
import { api } from '../../../src/lib/api';
import { colors, spacing, radii, typography, shadows } from '../../../src/lib/theme';

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
  const removePlay = usePlayStore((s) => s.removePlay);
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

  function handleLeavePlay() {
    Alert.alert(
      'Leave this play?',
      'You\'ll be removed from the cast. You can be re-invited later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/plays/${playId}/leave`, { method: 'DELETE' });
              removePlay(playId!);
              router.back();
            } catch (err) {
              console.error('Leave play error:', err);
              Alert.alert('Error', 'Failed to leave play.');
            }
          },
        },
      ]
    );
  }

  if (!play) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Play not found.</Text>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.rose} />
      </SafeAreaView>
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Custom top bar */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={styles.backArrow}>{'\u2190'}</Text>
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {play.title}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Cast section */}
        <Text style={styles.sectionLabel}>CAST</Text>
        {characters.length === 0 ? (
          <Text style={styles.emptyText}>No characters found</Text>
        ) : (
          <FlatList
            data={characters}
            keyExtractor={(c) => c.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.castRow}
            renderItem={({ item: c }) => {
              const assignment = assignmentByCharacter.get(c.id);
              const isMe = assignment?.user_id === currentUser?.id;
              const isAssigned = !!assignment;

              return (
                <Pressable
                  style={[
                    styles.characterCard,
                    isMe && styles.characterCardMine,
                  ]}
                  onPress={() => showCharacterMenu(c.id, c.name, isMe)}
                                 >
                  {/* Avatar */}
                  {isAssigned ? (
                    <View style={[styles.avatar, isMe && styles.avatarMine]}>
                      <Text style={styles.avatarText}>
                        {getInitials(isMe ? (currentUser?.name ?? 'ME') : assignment.user_name)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.avatarUnassigned}>
                      <Text style={styles.avatarUnassignedText}>?</Text>
                    </View>
                  )}

                  {/* Name */}
                  <Text style={styles.characterName} numberOfLines={2}>
                    {c.name}
                  </Text>

                  {/* Status */}
                  {isMe ? (
                    <Text style={styles.statusMe}>You</Text>
                  ) : isAssigned ? (
                    <Text style={styles.statusAssigned} numberOfLines={1}>
                      {assignment.user_name}
                    </Text>
                  ) : (
                    <Text style={styles.statusOpen}>Open</Text>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {/* Scenes section */}
        <Text style={[styles.sectionLabel, styles.scenesLabel]}>SCENES</Text>
        {scenes.length === 0 ? (
          <Text style={styles.emptyText}>No scenes parsed yet</Text>
        ) : (
          <View style={styles.scenesList}>
            {scenes.map((scene) => (
              <Pressable
                key={scene.id}
                style={({ pressed }) => [
                  styles.sceneCard,
                  pressed && styles.sceneCardPressed,
                ]}
                onPress={() => router.push(`/rehearse/${scene.id}?characterIds=${myCharacterIds.join(',')}`)}
                             >
                <Text style={styles.sceneName}>{scene.name}</Text>
                <Text style={styles.sceneChevron}>{'\u203A'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Leave play */}
        <Pressable style={styles.leaveButton} onPress={handleLeavePlay}>
          <Text style={styles.leaveButtonText}>Leave Play</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_WIDTH = 100;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '600',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.rose,
    marginBottom: spacing.md,
  },
  scenesLabel: {
    marginTop: spacing.xxl,
  },
  castRow: {
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  characterCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  characterCardMine: {
    borderWidth: 2,
    borderColor: colors.rose,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.sage,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarMine: {
    backgroundColor: colors.rose,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse,
  },
  avatarUnassigned: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarUnassignedText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  characterName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  statusMe: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.rose,
  },
  statusAssigned: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statusOpen: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  scenesList: {
    gap: spacing.md,
  },
  sceneCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadows.sm,
  },
  sceneCardPressed: {
    opacity: 0.7,
  },
  sceneName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  sceneChevron: {
    fontSize: 28,
    color: colors.rose,
    fontWeight: '700',
    marginLeft: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 17,
    color: colors.coral,
    textAlign: 'center',
    marginTop: spacing.xxxxl,
  },
  leaveButton: {
    marginTop: spacing.xxxxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.coral,
  },
});
