import { Router, Request, Response } from "express";
import pool from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/users/me
 * Get current user profile.
 */
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT id, name, avatar_uri, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error getting user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/users/me
 * Update current user profile (name, avatar_uri).
 */
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, avatar_uri } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }

    if (avatar_uri !== undefined) {
      updates.push(`avatar_uri = $${paramIndex++}`);
      values.push(avatar_uri);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update. Provide name or avatar_uri." });
      return;
    }

    values.push(userId);

    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, avatar_uri, created_at`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
