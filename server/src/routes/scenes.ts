import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/plays/:playId/scenes
 * List scenes for a play, ordered by sort.
 */
router.get("/plays/:playId/scenes", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;

    const result = await pool.query(
      `SELECT s.id, s.play_id, s.name, s.sort,
              COUNT(l.id)::int AS line_count
       FROM scenes s
       LEFT JOIN lines l ON l.scene_id = s.id
       WHERE s.play_id = $1
       GROUP BY s.id
       ORDER BY s.sort`,
      [playId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error listing scenes:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/scenes/:id
 * Get a scene with all its lines (and their characters).
 */
router.get("/scenes/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sceneResult = await pool.query(
      `SELECT id, play_id, name, sort
       FROM scenes
       WHERE id = $1`,
      [id]
    );

    if (sceneResult.rows.length === 0) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    const scene = sceneResult.rows[0];

    const linesResult = await pool.query(
      `SELECT l.id, l.scene_id, l.character_id, l.text, l.type, l.sort, l.edited,
              c.name AS character_name
       FROM lines l
       LEFT JOIN characters c ON c.id = l.character_id
       WHERE l.scene_id = $1
       ORDER BY l.sort`,
      [id]
    );

    res.json({
      ...scene,
      lines: linesResult.rows,
    });
  } catch (err) {
    console.error("Error getting scene:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
