import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/plays
 * List plays for the current user (via play_members).
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT p.id, p.title, p.script_type, p.script_uri, p.created_at, p.created_by,
              pm.character_id,
              c.name AS character_name
       FROM plays p
       INNER JOIN play_members pm ON pm.play_id = p.id AND pm.user_id = $1
       LEFT JOIN characters c ON c.id = pm.character_id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error listing plays:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/plays/:id
 * Get a play with its characters and scenes.
 */
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const playResult = await pool.query(
      `SELECT id, title, created_by, script_type, script_uri, created_at
       FROM plays
       WHERE id = $1`,
      [id]
    );

    if (playResult.rows.length === 0) {
      res.status(404).json({ error: "Play not found" });
      return;
    }

    const play = playResult.rows[0];

    const [charactersResult, scenesResult, membersResult] = await Promise.all([
      pool.query(
        `SELECT id, name
         FROM characters
         WHERE play_id = $1
         ORDER BY name`,
        [id]
      ),
      pool.query(
        `SELECT id, name, sort
         FROM scenes
         WHERE play_id = $1
         ORDER BY sort`,
        [id]
      ),
      pool.query(
        `SELECT pm.user_id, pm.character_id, u.name AS user_name, u.avatar_uri,
                c.name AS character_name
         FROM play_members pm
         INNER JOIN users u ON u.id = pm.user_id
         LEFT JOIN characters c ON c.id = pm.character_id
         WHERE pm.play_id = $1`,
        [id]
      ),
    ]);

    res.json({
      ...play,
      characters: charactersResult.rows,
      scenes: scenesResult.rows,
      members: membersResult.rows,
    });
  } catch (err) {
    console.error("Error getting play:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/plays
 * Create a new play. The creator is automatically added as a play_member.
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const userId = req.user!.id;
    const { title, script_type, script_uri } = req.body;

    if (!title || !script_type) {
      res.status(400).json({ error: "title and script_type are required" });
      return;
    }

    if (!["pdf", "photos"].includes(script_type)) {
      res.status(400).json({ error: "script_type must be 'pdf' or 'photos'" });
      return;
    }

    await client.query("BEGIN");

    const playResult = await client.query(
      `INSERT INTO plays (title, created_by, script_type, script_uri)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, created_by, script_type, script_uri, created_at`,
      [title, userId, script_type, script_uri || null]
    );

    const play = playResult.rows[0];

    // Auto-add creator as play member
    await client.query(
      `INSERT INTO play_members (play_id, user_id)
       VALUES ($1, $2)`,
      [play.id, userId]
    );

    await client.query("COMMIT");

    res.status(201).json(play);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating play:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

export default router;
