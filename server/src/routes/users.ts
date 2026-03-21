import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/users/me
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabase
      .from("users")
      .select("id, name, avatar_uri, created_at")
      .eq("id", userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Error getting user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/me
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, avatar_uri } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      updates.name = name.trim();
    }
    if (avatar_uri !== undefined) {
      updates.avatar_uri = avatar_uri;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update. Provide name or avatar_uri." });
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, name, avatar_uri, created_at")
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
