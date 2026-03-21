import pg from "pg";

const { Pool } = pg;

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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Create seed user
    const userResult = await client.query(
      `INSERT INTO users (name, avatar_uri)
       VALUES ($1, $2)
       RETURNING id`,
      ["Seed User", null]
    );
    const userId = userResult.rows[0].id;
    console.log(`Created seed user: ${userId}`);

    // 2. Create the Romeo & Juliet play
    const playResult = await client.query(
      `INSERT INTO plays (title, created_by, script_type, script_uri)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ["Romeo & Juliet", userId, "pdf", null]
    );
    const playId = playResult.rows[0].id;
    console.log(`Created play: ${playId}`);

    // 3. Create ROMEO and JULIET characters
    const romeoResult = await client.query(
      `INSERT INTO characters (play_id, name)
       VALUES ($1, $2)
       RETURNING id`,
      [playId, "ROMEO"]
    );
    const romeoId = romeoResult.rows[0].id;

    const julietResult = await client.query(
      `INSERT INTO characters (play_id, name)
       VALUES ($1, $2)
       RETURNING id`,
      [playId, "JULIET"]
    );
    const julietId = julietResult.rows[0].id;
    console.log(`Created characters: ROMEO (${romeoId}), JULIET (${julietId})`);

    // 4. Create Act II Scene II
    const sceneResult = await client.query(
      `INSERT INTO scenes (play_id, name, sort)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [playId, "Act II, Scene II \u2014 The Balcony", 1]
    );
    const sceneId = sceneResult.rows[0].id;
    console.log(`Created scene: ${sceneId}`);

    // 5. Create all 16 lines
    const characterMap: Record<string, string> = {
      ROMEO: romeoId,
      JULIET: julietId,
    };

    for (const line of SEED_LINES) {
      await client.query(
        `INSERT INTO lines (scene_id, character_id, text, type, sort)
         VALUES ($1, $2, $3, $4, $5)`,
        [sceneId, characterMap[line.character], line.text, "dialogue", line.sort]
      );
    }
    console.log(`Created ${SEED_LINES.length} lines`);

    // 6. Add seed user as a PlayMember
    await client.query(
      `INSERT INTO play_members (play_id, user_id, character_id)
       VALUES ($1, $2, $3)`,
      [playId, userId, romeoId]
    );
    console.log(`Added seed user as PlayMember (ROMEO)`);

    await client.query("COMMIT");
    console.log("Seed complete!");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
