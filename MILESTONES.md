# Sides — Build Milestones

## Milestone 1: Project Scaffold & Data Model

- Expo project setup (managed workflow, TypeScript, Expo Router)
- Tab navigation (Home, Library, Settings)
- Backend: Node + Express + TypeScript on Vercel
- Database: PostgreSQL on Supabase
- Implement full schema: User, Play, ScriptPage, Character, PlayMember, Scene, Line, Recording, Reaction
- Auth: Google OAuth (Supabase native) + Snapchat (Snap Kit Login Kit via Express)
- User creation from auth profile (name + optional avatar)
- Zustand client stores wired to backend API
- Seed database with Romeo & Juliet sample play/scene/lines

**Done when:** App boots on iOS simulator, shows empty home screen, sample play exists in the database.

---

## Milestone 2: Script Upload & Parsing

- Upload flow: PDF via expo-document-picker, photos via expo-image-picker
- Script parsing: PDF text extraction and photo OCR → scenes, characters, lines
- Create Play, Characters, Scenes, and Lines from parsed output
- Play detail screen: tap PlayCard → see scene list + characters
- Scene list with SceneCards

**Done when:** User can upload a script (PDF or photos), app parses it into scenes/characters/lines, and the play appears on the home screen with its scenes listed.

---

## Milestone 3: Rehearsal — Learning Mode

- Rehearsal state machine: idle → loading → playing → my_turn → done
- ScriptView: scrollable script with all lines, current line highlighted and auto-scrolled
- ScriptLine: individual line rows with visual state (playing, your turn, done)
- ElevenLabs TTS integration: fetch audio per line, cache by hash(character + text)
- Learning mode: lines visible, mic listens with live transcription, auto-advances on match
- Fallback: tap to advance
- Tap past lines to jump back and resume

**Done when:** User can select a scene, pick their character, and rehearse in learning mode end-to-end with TTS voicing other characters and transcription-based auto-advance.

---

## Milestone 4: Rehearsal — Practice Mode

- Practice mode: actor's lines hidden
- Hint system: tap Hint for first word → full line progressive reveal
- Mic listens with live transcription, auto-advances on match
- Fallback: tap Done to advance
- Mode switcher: toggle between learning and practice during rehearsal

**Done when:** User can rehearse in practice mode with lines hidden, use hints, and auto-advance via transcription.

---

## Milestone 5: Rehearsal — Recording Mode

- Recording mode: mic auto-starts recording when it's the actor's turn
- Visual feedback: pulsing indicator, red border while recording
- Live transcription auto-stops recording when line is complete
- Auto-advance after recording (no keep/re-record prompt)
- Re-record: tap a line in script view to jump back and re-record over previous take
- First-line exception: Record button with 3-2-1 countdown
- Recordings saved to backend + audio storage

**Done when:** User can rehearse in recording mode, recordings are captured and uploaded per line, re-recording works by tapping back.

---

## Milestone 6: Inline Line Editing

- Tap/long-press any ScriptLine to open LineEditor
- Edit line text, save, mark `edited = true`
- Invalidate TTS cache for edited line (re-fetches on next play)
- Works during rehearsal and in scene view

**Done when:** User can correct garbled/wrong lines inline, and TTS uses the corrected text on next rehearsal.

---

## Milestone 7: Script Navigation & Bookmarks

- Jump to next line: "Next" button in toolbar scrolls to and highlights the user's next upcoming line
- Jump to previous line: "Prev" button scrolls back to the user's previous line
- Line search: search bar filters lines by text content, highlights matches in-place
- Scene search: search across all scenes in a play, jump directly to a matching line
- Bookmarks: tap a bookmark icon on any line to pin it for quick access
- Bookmarks panel: slide-out or bottom sheet showing all bookmarked lines, tap to jump
- Cue line highlighting: option to highlight the line before each of your lines (your "cue")
- Line count summary: "You have 24 lines in this scene" shown in scene header

**Done when:** User can quickly navigate to their lines via next/prev buttons, search for specific dialogue, bookmark important lines, and see cue lines highlighted.

---

## Milestone 8: Peer Invites & Cast Collaboration

- Invite flow: tap "Invite" on a character → generate shareable deep link (`sides://invite/{playId}/{characterId}`)
- Invited user opens link → creates account / logs in → joins Play as PlayMember with character assigned
- Invited user sees play, scenes, their lines
- Recordings from cast members sync via backend — real voice replaces TTS for that character
- Push notifications: "Maya just recorded her Juliet lines for Act II, Scene II"

**Done when:** Actor A can invite Actor B to a character, Actor B records their lines, and Actor A hears Actor B's real voice during rehearsal.

---

## Milestone 9: Social — Reactions & Notifications

- Reaction on recordings: emoji (🔥, 😂, 💀, 👏, ❤️) and/or short notes
- Reactions visible on recordings in the app
- Push notification to recorder when someone reacts
- Push notification to cast when new recordings are available
- Activity feed on home screen showing cast activity

**Done when:** Cast members can react to recordings with emojis and notes, notifications work end-to-end.

---

## Milestone 10: Robust Script Upload & Parsing

- Chunked image parsing: break scanned PDFs into batches (20-30 pages), parse each batch separately, merge results
- PDF compression pipeline: mupdf garbage collection + stream compression before sending to Claude
- Large PDF progress: show page-level progress during parsing ("Reading pages 41-60 of 201...")
- Scanned PDF support: detect image-only PDFs, render pages as images, send to Claude vision in batches
- Text extraction fallback: when PDF is too large and compression isn't enough, extract text with mupdf
- Claude API size limits: 25MB for PDF documents, ~100 images per request — handle gracefully
- Upload retry with exponential backoff: connection drops on long parses (seen at ~500 streaming chunks)
- Error messages: surface specific errors to user ("PDF too large", "Scanned PDF not supported yet") instead of generic "Internal error"
- File type validation: reject non-PDF files client-side before upload
- Musical support: preserve sheet music notation context when parsing (requires image-based approach, not text extraction)
- Multi-act merging: when parsing in batches, correctly merge characters and maintain scene continuity across chunks
- Duplicate character deduplication: handle slight name variations across batches ("ROMEO" vs "Romeo")

**Done when:** Any reasonable script PDF (up to 50MB, scanned or digital, play or musical) uploads and parses correctly with clear progress and error feedback.

---

## Milestone 11: Polish & Ship

- Design language applied: purple/amber palette, serif for script lines, sans-serif for UI chrome
- Avatar component: user photo or initials fallback
- CharacterRow: character + who's playing + AI/recorded badge
- Loading states, error handling, empty states
- Performance: TTS pre-fetching, audio caching, smooth scroll in ScriptView
- iOS simulator runs out of the box with ElevenLabs API key in settings
