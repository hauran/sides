import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/scenes/:sceneId/lines
 * List lines for a scene, ordered by sort.
 */
router.get("/scenes/:sceneId/lines", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sceneId } = req.params;

    const result = await pool.query(
      `SELECT l.id, l.scene_id, l.character_id, l.text, l.type, l.sort, l.edited,
              c.name AS character_name
       FROM lines l
       LEFT JOIN characters c ON c.id = l.character_id
       WHERE l.scene_id = $1
       ORDER BY l.sort`,
      [sceneId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error listing lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/lines/:id
 * Update line text. Sets edited=true.
 */
router.patch("/lines/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required and must be a string" });
      return;
    }

    const result = await pool.query(
      `UPDATE lines
       SET text = $1, edited = true
       WHERE id = $2
       RETURNING id, scene_id, character_id, text, type, sort, edited`,
      [text, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Line not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating line:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
