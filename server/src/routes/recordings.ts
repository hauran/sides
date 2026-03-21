import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/lines/:lineId/recordings
 * Get recordings for a line.
 */
router.get("/lines/:lineId/recordings", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { lineId } = req.params;

    const result = await pool.query(
      `SELECT r.id, r.line_id, r.recorded_by, r.audio_uri, r.recorded_at,
              u.name AS recorded_by_name, u.avatar_uri AS recorded_by_avatar
       FROM recordings r
       INNER JOIN users u ON u.id = r.recorded_by
       WHERE r.line_id = $1
       ORDER BY r.recorded_at DESC`,
      [lineId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error listing recordings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/recordings
 * Create a recording for a line.
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { line_id, audio_uri } = req.body;

    if (!line_id || !audio_uri) {
      res.status(400).json({ error: "line_id and audio_uri are required" });
      return;
    }

    // Verify the line exists
    const lineCheck = await pool.query("SELECT id FROM lines WHERE id = $1", [line_id]);
    if (lineCheck.rows.length === 0) {
      res.status(404).json({ error: "Line not found" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO recordings (line_id, recorded_by, audio_uri)
       VALUES ($1, $2, $3)
       RETURNING id, line_id, recorded_by, audio_uri, recorded_at`,
      [line_id, userId, audio_uri]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating recording:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
