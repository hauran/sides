import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/plays/:playId/characters
router.get("/plays/:playId/characters", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;

    const { data: characters, error } = await supabase
      .from("characters")
      .select("id, play_id, name")
      .eq("play_id", playId)
      .order("name");
    if (error) throw error;

    res.json(characters ?? []);
  } catch (err) {
    console.error("Error listing characters:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
