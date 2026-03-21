import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SEED_LINES = [
  { character: "ROMEO",  text: "But, soft! what light through yonder window breaks? It is the east, and Juliet is the sun.", sort: 1 },
  { character: "JULIET", text: "O Romeo, Romeo! wherefore art thou Romeo? Deny thy father and refuse thy name.", sort: 2 },
  { character: "ROMEO",  text: "Shall I hear more, or shall I speak at this?", sort: 3 },
  { character: "JULIET", text: "'Tis but thy name that is my enemy. Thou art thyself, though not a Montague.", sort: 4 },
  { character: "ROMEO",  text: "I take thee at thy word: Call me but love, and I'll be new baptized; henceforth I never will be Romeo.", sort: 5 },
  { character: "JULIET", text: "What man art thou that thus bescreen'd in night so stumblest on my counsel?", sort: 6 },
  { character: "ROMEO",  text: "By a name I know not how to tell thee who I am. My name, dear saint, is hateful to myself, because it is an enemy to thee.", sort: 7 },
  { character: "JULIET", text: "My ears have not yet drunk a hundred words of thy tongue's utterance, yet I know the sound. Art thou not Romeo, and a Montague?", sort: 8 },
  { character: "ROMEO",  text: "Neither, fair saint, if either thee dislike.", sort: 9 },
  { character: "JULIET", text: "How camest thou hither, tell me, and wherefore? The orchard walls are high and hard to climb, and the place death, considering who thou art.", sort: 10 },
  { character: "ROMEO",  text: "With love's light wings did I o'er-perch these walls; For stony limits cannot hold love out.", sort: 11 },
  { character: "JULIET", text: "If they do see thee, they will murder thee.", sort: 12 },
  { character: "ROMEO",  text: "Alack, there lies more peril in thine eye than twenty of their swords!", sort: 13 },
  { character: "JULIET", text: "Thou know'st the mask of night is on my face, else would a maiden blush bepaint my cheek for that which thou hast heard me speak to-night.", sort: 14 },
  { character: "ROMEO",  text: "Lady, by yonder blessed moon I swear, that tips with silver all these fruit-tree tops...", sort: 15 },
  { character: "JULIET", text: "O, swear not by the moon, the inconstant moon, that monthly changes in her circled orb, lest that thy love prove likewise variable.", sort: 16 },
];

async function seed() {
  // 1. Look up existing user
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", "richardmai@gmail.com")
    .single();
  if (userErr) throw userErr;
  console.log(`Found user: ${user.id}`);

  // 2. Create the Romeo & Juliet play
  const { data: play, error: playErr } = await supabase
    .from("plays")
    .insert({ title: "Romeo & Juliet", created_by: user.id, script_type: "pdf" })
    .select("id")
    .single();
  if (playErr) throw playErr;
  console.log(`Created play: ${play.id}`);

  // 3. Create characters
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .insert([
      { play_id: play.id, name: "ROMEO" },
      { play_id: play.id, name: "JULIET" },
    ])
    .select("id, name");
  if (charErr) throw charErr;
  const charMap: Record<string, string> = {};
  for (const c of characters) charMap[c.name] = c.id;
  console.log(`Created characters: ROMEO (${charMap.ROMEO}), JULIET (${charMap.JULIET})`);

  // 4. Create scene
  const { data: scene, error: sceneErr } = await supabase
    .from("scenes")
    .insert({ play_id: play.id, name: "Act II, Scene II \u2014 The Balcony", sort: 1 })
    .select("id")
    .single();
  if (sceneErr) throw sceneErr;
  console.log(`Created scene: ${scene.id}`);

  // 5. Create lines
  const lineRows = SEED_LINES.map((l) => ({
    scene_id: scene.id,
    character_id: charMap[l.character],
    text: l.text,
    type: "dialogue" as const,
    sort: l.sort,
  }));
  const { error: linesErr } = await supabase.from("lines").insert(lineRows);
  if (linesErr) throw linesErr;
  console.log(`Created ${SEED_LINES.length} lines`);

  // 6. Add seed user as PlayMember playing ROMEO
  const { error: memberErr } = await supabase
    .from("play_members")
    .insert({ play_id: play.id, user_id: user.id, character_id: charMap.ROMEO });
  if (memberErr) throw memberErr;
  console.log("Added seed user as PlayMember (ROMEO)");

  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
