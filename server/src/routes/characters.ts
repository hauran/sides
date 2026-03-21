import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/plays/:playId/characters
 * List characters for a play.
 */
router.get("/plays/:playId/characters", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;

    const result = await pool.query(
      `SELECT c.id, c.play_id, c.name,
              COUNT(DISTINCT l.id)::int AS line_count,
              COUNT(DISTINCT r.id)::int AS recording_count,
              pm.user_id AS assigned_user_id,
              u.name AS assigned_user_name
       FROM characters c
       LEFT JOIN lines l ON l.character_id = c.id
       LEFT JOIN recordings r ON r.line_id = l.id
       LEFT JOIN play_members pm ON pm.character_id = c.id AND pm.play_id = c.play_id
       LEFT JOIN users u ON u.id = pm.user_id
       WHERE c.play_id = $1
       GROUP BY c.id, pm.user_id, u.name
       ORDER BY c.name`,
      [playId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error listing characters:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
