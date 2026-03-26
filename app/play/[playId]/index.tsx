import { useEffect, useState, useCallback, useRef } from 'react';
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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { usePlayStore } from '../../../src/store/usePlayStore';
import { useUserStore } from '../../../src/store/useUserStore';
import { useBookmarkStore } from '../../../src/store/useBookmarkStore';
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
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const fetchBookmarks = useBookmarkStore((s) => s.fetchBookmarks);
  const [detail, setDetail] = useState<PlayDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; text: string; scene_id: string; scene_name: string; character_name: string }[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      if (!playId) return;
      try {
        const results = await api<typeof searchResults>(`/plays/${playId}/search?q=${encodeURIComponent(text.trim())}`);
        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  }

  const fetchDetail = useCallback(() => {
    if (playId) {
      api<PlayDetail>(`/plays/${playId}`).then(setDetail).catch(console.error);
    }
  }, [playId]);

  useEffect(() => {
    fetchDetail();
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [fetchDetail]);

  useFocusEffect(
    useCallback(() => {
      if (playId) fetchBookmarks(playId);
    }, [playId])
  );

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
        {/* Search bar */}
        <TextInput
          style={styles.searchBar}
          placeholder="Search lines..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={handleSearchChange}
        />

        {/* Search results */}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((r) => (
              <Pressable
                key={r.id}
                style={({ pressed }) => [styles.searchResultItem, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  router.push(`/rehearse/${r.scene_id}?characterIds=${myCharacterIds.join(',')}&scrollToLine=${r.id}`);
                }}
              >
                <Text style={styles.searchResultScene}>{r.scene_name}</Text>
                <Text style={styles.searchResultChar}>{r.character_name}</Text>
                <Text style={styles.searchResultText} numberOfLines={1}>{r.text}</Text>
              </Pressable>
            ))}
          </View>
        )}

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

        {/* Bookmarks section */}
        <Text style={[styles.sectionLabel, styles.scenesLabel]}>BOOKMARKS</Text>
        {(() => {
          const bookmarkList = Object.values(bookmarks).filter((b) => b.scene_id);
          if (bookmarkList.length === 0) {
            return <Text style={styles.emptyText}>No bookmarks yet</Text>;
          }
          return (
            <View style={styles.scenesList}>
              {bookmarkList.map((b) => (
                <Pressable
                  key={b.id}
                  style={({ pressed }) => [
                    styles.bookmarkCard,
                    pressed && styles.sceneCardPressed,
                  ]}
                  onPress={() => router.push(`/rehearse/${b.scene_id}?characterIds=${myCharacterIds.join(',')}&scrollToLine=${b.line_id}`)}
                >
                  <View style={styles.bookmarkContent}>
                    <Text style={styles.bookmarkCharacter}>{b.character_name ?? 'Unknown'}</Text>
                    <Text style={styles.bookmarkText} numberOfLines={1}>{b.line_text}</Text>
                    <Text style={styles.bookmarkScene}>{b.scene_name}</Text>
                  </View>
                  <Text style={styles.bookmarkIcon}>{'\u2605'}</Text>
                </Pressable>
              ))}
            </View>
          );
        })()}

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
  searchBar: {
    height: 40,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  searchResults: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  searchResultItem: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  searchResultScene: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.rose,
    marginBottom: 1,
  },
  searchResultChar: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.sage,
    marginBottom: 2,
  },
  searchResultText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: 'Georgia',
  },
  bookmarkContent: {
    flex: 1,
  },
  bookmarkCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  bookmarkCharacter: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.honey,
    marginBottom: 2,
  },
  bookmarkText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: 'Georgia',
  },
  bookmarkScene: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bookmarkIcon: {
    fontSize: 16,
    color: colors.honey,
    marginLeft: spacing.md,
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
