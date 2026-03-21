# Build "Sides" — A React Native Expo App for Teen Theater Line Learning

## What we're building

Sides is a mobile app that helps teen actors memorize their lines by rehearsing with AI-voiced scene partners, progressively replaced by real recordings from their castmates.

**Core mechanic:**
- the first Actor uploads a script — either a PDF or photos of individual pages
- App parses the script to extract scenes, characters, and lines (PDF text extraction or OCR for photos)
- Actor picks a scene and their character — rehearsal starts immediately, no review gate
- Every other character's lines are immediately voiced by ElevenLabs TTS — the app is always ready to rehearse, never in a waiting state
- If a parsed line looks wrong (OCR artifact, garbled text), the actor corrects it inline — tap the line, edit, save. TTS cache for that line invalidates and re-fetches on next play.
- Actor can invite castmates (peer-to-peer, no director/admin hierarchy) to record their character's lines
- As castmates record, their real voice replaces ElevenLabs for that character
- Actor rehearses: app speaks other characters' lines (AI or real recording), pauses for actor's line, actor taps Done to advance

**This is NOT Offbook.co.** That product targets professional/conservatory actors. Sides targets teen theater kids — school productions, community theater, three friends who got cast together. Tone is casual, social, peer-driven. No director dashboard, no admin, no oversight layer.

---

## Tech stack

- **Expo** (managed workflow, SDK 51+)
- **React Native** with TypeScript
- **Expo Router** for navigation (file-based, tabs + stack)
- **expo-av** for audio recording and playback
- **expo-image-picker** for script photo import
- **expo-document-picker** for PDF script upload
- **react-native-pdf-lib** or server-side extraction for PDF text parsing
- **expo-file-system** for local audio cache
- **ElevenLabs API** (`eleven_turbo_v2` model) for TTS
- **Zustand** for client state
- **Node + Express + TypeScript** on Vercel — API backend
- **PostgreSQL on Supabase** — database and auth (Google OAuth native, Snapchat via Snap Kit Login Kit)
- **Audio storage** (S3/cloud storage) — uploaded recordings served to castmates

---

## Project structure

```
/app
  (tabs)/
    index.tsx          — Home: your plays, recent activity
    library.tsx        — All scenes in the current play
    settings.tsx       — API key, profile name, display prefs
  play/new.tsx            — Upload script (PDF or photos) → create a new play
  play/[playId]/          — Play detail: scenes list, characters
  rehearse/[sceneId].tsx  — Core rehearsal screen (includes inline recording during your turn)
  invite/[sceneId].tsx    — Invite a castmate to a character

/src
  /components
    PlayCard.tsx        — Play title page: cast members, which roles have recorded lines. Tap → scene list.
    SceneCard.tsx       — Scene row within a play. Tap → opens rehearsal screen for that scene.
    CharacterRow.tsx    — Character name + who's playing them + AI or recorded badge (used in PlayCard detail)
    ScriptView.tsx      — Scrollable script view for rehearsal. All lines visible, current line highlighted and auto-scrolled to.
    ScriptLine.tsx      — Individual line row within ScriptView: character name, line text, visual state (playing, recording, your turn, done)
    LineEditor.tsx      — Inline edit modal for correcting a parsed line (tap a ScriptLine to open)
    HintButton.tsx      — First word → full line hint stepper
    Avatar.tsx          — User avatar image or initials fallback, consistent across the app

  /lib
    elevenlabs.ts       — TTS fetch → temp audio file via FileSystem
    scriptParser.ts     — PDF text extraction + photo OCR → scenes/characters/lines
    recorder.ts         — expo-av recording wrapper (start/stop/playback/save)
    sharing.ts          — Generate deep links for castmate invites

  /store
    useUserStore.ts     — Current user profile
    usePlayStore.ts     — Plays, their script sources, processing status
    useSceneStore.ts    — Scenes, lines, which characters have recordings
    useCastStore.ts     — Castmate profiles and their recorded character packs
    useSettingsStore.ts — API key, display prefs

  /hooks
    useRehearsal.ts     — Core rehearsal state machine (loading/playing/my_turn/recording/done)
    useRecorder.ts      — Recording within rehearsal: auto-start after cue, keep/re-record

/assets
  /sounds              — UI sounds (optional: tap, advance, done)
```

---

## Core data model

```
User
  id            PK
  name                    -- display name, e.g. "Maya"
  avatar_uri    nullable  -- photo; fallback to initials derived from name
  created_at

Play
  id            PK
  title                   -- "Romeo & Juliet"
  created_by    FK → User
  script_type             -- "pdf" | "photos"
  script_uri    nullable  -- PDF file URI (if pdf)
  created_at

ScriptPage
  id            PK
  play_id       FK → Play
  uri                     -- photo URI for this page
  sort                    -- page order (1, 2, 3...)

Character
  id            PK
  play_id       FK → Play
  name                    -- "ROMEO", "JULIET", etc.
  UNIQUE (play_id, name)

PlayMember
  play_id       FK → Play
  user_id       FK → User
  character_id  FK → Character, nullable  -- which character they're playing, if assigned
  PK (play_id, user_id)

Scene
  id            PK
  play_id       FK → Play
  name                    -- "Act II, Scene II — The Balcony"
  sort                    -- scene order (1, 2, 3...)

Line
  id            PK
  scene_id      FK → Scene
  character_id  FK → Character, nullable  -- null for stage directions
  text
  type                    -- "dialogue" | "stage_direction"
  sort                    -- line order within the scene
  edited        default false  -- true if user corrected after parsing

Recording
  id            PK
  line_id       FK → Line
  recorded_by   FK → User
  audio_uri               -- local file path
  recorded_at

Reaction
  id            PK
  recording_id  FK → Recording
  user_id       FK → User
  emoji         nullable  -- "🔥", "😂", "💀", "👏", "❤️", etc.
  note          nullable  -- short text, e.g. "ur Romeo voice is so good"
  created_at

```

**Relations:**
```
User 1──∞ Play             (created_by)
Play 1──∞ ScriptPage       (play_id, ordered by sort)
Play 1──∞ Character        (play_id)
Play 1──∞ PlayMember       (play_id)
User 1──∞ PlayMember       (user_id)
Character 1──∞ PlayMember  (character_id, nullable)
Play 1──∞ Scene            (play_id, ordered by sort)
Scene 1──∞ Line            (scene_id, ordered by sort)
Character 1──∞ Line        (character_id, nullable)
Line 1──∞ Recording        (line_id)
User 1──∞ Recording        (recorded_by)
Recording 1──∞ Reaction    (recording_id)
User 1──∞ Reaction         (user_id)
```

---

## The rehearsal state machine

This is the heart of the app. Implement it as a hook `useRehearsal(sceneId, myCharacter)`.

### Modes

The actor picks a mode before (or during) rehearsal. The mode determines what happens during `my_turn`.

**Learning mode** — Your lines are visible. Mic listens with live transcription — auto-advances when it matches the expected line text (hands-free). Fallback: tap to advance.

**Recording mode** — Your lines are visible. When it's your turn, mic auto-starts recording. Live transcription matches against the expected line text — when the actor finishes the line, recording auto-stops and advances. Fallback: tap Done if transcription doesn't catch it. Keep/re-record after each take. Saved as Recordings.

**Practice mode** — Your lines are hidden. "Your turn..." prompt only. Tap for hints: first word → full line. Tap Done to advance.

### States

```
States: idle | loading | playing | my_turn | done

  idle        — Rehearsal screen open but not running. Waiting for user to start.
  loading     — Fetching audio for another character's line (TTS call or loading Recording from disk).
  playing     — Audio is playing. User hears the other character's line, follows along in script view.
  my_turn     — It's the actor's line. Behavior depends on mode:
                  learning:  line visible, mic listens, auto-advances on transcription match
                  recording: line visible, mic records, auto-stops via live transcription match (or tap Done)
                  practice:  line hidden, mic listens, auto-advances on transcription match. Tap Hint for first word → full line.
  done        — Last line of the scene has completed.
```

### Transitions

```
  idle → loading     when user starts rehearsal
  loading → playing  when audio is ready and playing
  playing → my_turn  when audio ends and next line is my character
  playing → loading  when audio ends and next line is another character
  my_turn → loading  when advancing to next line:
                       learning:  auto-advance on transcription match, or tap
                       recording: auto-advance on transcription match, or tap Done
                       practice:  auto-advance on transcription match, or tap Done. Tap Hint for progressive reveal.
  any → done         when last line completes
  any → idle         on pause or error
```

**Exception — first line of scene:** If the actor's character speaks first, there's no cue line to trigger from. In recording mode, show a Record button with 3-2-1 countdown before starting. In learning/practice mode, start immediately.

### Key behaviors

- ElevenLabs is always the fallback — if a cast mate has recorded a character, use their audio file; otherwise call ElevenLabs
- Script view is the scrubber: tap any past line to jump back and resume from that point (cancels current audio, resets hint)
- **Inline line editing:** Tap/long-press any line (during rehearsal or in scene view) to edit its text. On save, mark `line.edited = true`, invalidate TTS cache for that line, and persist the change. No upfront script review — corrections happen just-in-time as the actor encounters issues.

---

## ElevenLabs integration

```typescript
// src/lib/elevenlabs.ts

const VOICE_MAP: Record<string, string> = {
  ROMEO: "pNInz6obpgDQGcFmaJgB",
  JULIET: "21m00Tcm4TlvDq8ikWAM",
  NURSE: "ThT5KcBeYPX3keUQqHPh",
  BENVOLIO: "VR6AewLTigWG4xSOukaG",
  MERCUTIO: "TxGEqnHWrfWFTfGW9XjX",
  DEFAULT: "ErXwobaYiN019PkySvjV",
};

// Fetch TTS audio, write to FileSystem.cacheDirectory, return local URI
// Use eleven_turbo_v2, stability 0.45, similarity_boost 0.8
// Cache by hash of (character + text) so repeated lines don't re-fetch
export async function speakLine(text: string, character: string, apiKey: string): Promise<string>
```

---

## Recording flow (inline during rehearsal)

Recording happens inside the rehearsal screen, not on a separate page. When recording mode is on:

1. When the previous character's line finishes playing, recording starts automatically — no tap required
2. Visual feedback shows recording is active (pulsing indicator, red border, etc.)
3. Actor speaks their line — live transcription matches against expected text, auto-stops recording, and advances
4. No keep/re-record prompt — assumes the take is good and moves on. To re-record, tap that line in the script view to jump back (re-records over the previous take).
5. **Exception — first line of a scene:** If the actor's character speaks first, show a Record button. Tap it → 3-2-1 countdown → recording starts.
6. Recorded lines are saved as Recordings and can be shared with castmates

---

## Peer invite flow

1. Actor A taps "Invite" on a character in their play
2. App generates a shareable link: `sides://invite/{playId}/{characterId}`
3. Actor B opens link → creates account (or logs in) → joins the Play as a PlayMember assigned to that character
4. Actor B sees the play, scenes, and their lines. They rehearse in practice mode or jumps straight to recording mode — Recordings are uploaded to the backend.
5. Other cast members in the play get a push notification: "Maya just recorded her Juliet lines for Act II, Scene II"
6. Actor A's app pulls Actor B's Recordings — that character now plays Actor B's real voice instead of TTS.
7. Cast members can react to each other's recordings with emojis (🔥, 😂, 💀, 👏, ❤️) and short notes. Reactions notify the recorder.

---

## Sample script (use this as seed data)

Romeo & Juliet, Act II Scene II — 16 lines, characters: ROMEO, JULIET.

```typescript
export const SAMPLE_PLAY: Play = {
  id: "rj",
  title: "Romeo & Juliet",
  createdBy: "seed",
  scriptSource: { type: "pdf", uri: "" },
  createdAt: Date.now(),
};

export const SAMPLE_SCENE: Scene = {
  id: "rj-act2-scene2",
  playId: "rj",
  name: "Act II, Scene II — The Balcony",
  sort: 1,
};

export const SAMPLE_LINES: Line[] = [
  { id: "1",  sceneId: "rj-act2-scene2", character: "ROMEO",  text: "But, soft! what light through yonder window breaks? It is the east, and Juliet is the sun.", type: "dialogue", sort: 1 },
  { id: "2",  sceneId: "rj-act2-scene2", character: "JULIET", text: "O Romeo, Romeo! wherefore art thou Romeo? Deny thy father and refuse thy name.", type: "dialogue", sort: 2 },
  { id: "3",  sceneId: "rj-act2-scene2", character: "ROMEO",  text: "Shall I hear more, or shall I speak at this?", type: "dialogue", sort: 3 },
  { id: "4",  sceneId: "rj-act2-scene2", character: "JULIET", text: "'Tis but thy name that is my enemy. Thou art thyself, though not a Montague.", type: "dialogue", sort: 4 },
  { id: "5",  sceneId: "rj-act2-scene2", character: "ROMEO",  text: "I take thee at thy word: Call me but love, and I'll be new baptized; henceforth I never will be Romeo.", type: "dialogue", sort: 5 },
  { id: "6",  sceneId: "rj-act2-scene2", character: "JULIET", text: "What man art thou that thus bescreen'd in night so stumblest on my counsel?", type: "dialogue", sort: 6 },
  { id: "7",  sceneId: "rj-act2-scene2", character: "ROMEO",  text: "By a name I know not how to tell thee who I am. My name, dear saint, is hateful to myself, because it is an enemy to thee.", type: "dialogue", sort: 7 },
  { id: "8",  sceneId: "rj-act2-scene2", character: "JULIET", text: "My ears have not yet drunk a hundred words of thy tongue's utterance, yet I know the sound. Art thou not Romeo, and a Montague?", type: "dialogue", sort: 8 },
  { id: "9",  sceneId: "rj-act2-scene2", character: "ROMEO",  text: "Neither, fair saint, if either thee dislike.", type: "dialogue", sort: 9 },
  { id: "10", sceneId: "rj-act2-scene2", character: "JULIET", text: "How camest thou hither, tell me, and wherefore? The orchard walls are high and hard to climb, and the place death, considering who thou art.", type: "dialogue", sort: 10 },
  { id: "11", sceneId: "rj-act2-scene2", character: "ROMEO",  text: "With love's light wings did I o'er-perch these walls; For stony limits cannot hold love out.", type: "dialogue", sort: 11 },
  { id: "12", sceneId: "rj-act2-scene2", character: "JULIET", text: "If they do see thee, they will murder thee.", type: "dialogue", sort: 12 },
  { id: "13", sceneId: "rj-act2-scene2", character: "ROMEO",  text: "Alack, there lies more peril in thine eye than twenty of their swords!", type: "dialogue", sort: 13 },
  { id: "14", sceneId: "rj-act2-scene2", character: "JULIET", text: "Thou know'st the mask of night is on my face, else would a maiden blush bepaint my cheek for that which thou hast heard me speak to-night.", type: "dialogue", sort: 14 },
  { id: "15", sceneId: "rj-act2-scene2", character: "ROMEO",  text: "Lady, by yonder blessed moon I swear, that tips with silver all these fruit-tree tops...", type: "dialogue", sort: 15 },
  { id: "16", sceneId: "rj-act2-scene2", character: "JULIET", text: "O, swear not by the moon, the inconstant moon, that monthly changes in her circled orb, lest that thy love prove likewise variable.", type: "dialogue", sort: 16 },
];
```

---

## Design language

- **Name:** Sides
- **Tagline:** Know your sides.
- **Tone:** Built for a 16-year-old theater kid, not a Juilliard grad. Casual, social, fun. No corporate language.
- **Color:** Purple as primary (#534AB7 active states, #EEEDFE backgrounds). Amber for "your turn" moments (#EF9F27). Keep it clean.
- **Typography:** Serif font for script lines (they're lines from a play — they should feel like it). Sans-serif for UI chrome.
- **No dark patterns:** Sign in with Google or Snapchat — no email/password forms. No notifications without explicit opt-in.
- **Always rehearsable:** Once a script is uploaded and parsed, the app must never be in a state where the user can't practice right now. No review gate between parsing and rehearsal. ElevenLabs is always the floor.

---

**The app must run on iOS simulator out of the box** with just an ElevenLabs API key entered in settings.