import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/scenes/:sceneId/lines
router.get("/scenes/:sceneId/lines", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sceneId } = req.params;

    const { data: lines, error } = await supabase
      .from("lines")
      .select("id, scene_id, character_id, text, type, sort, edited, characters(name)")
      .eq("scene_id", sceneId)
      .order("sort");
    if (error) throw error;

    const result = (lines ?? []).map((l) => ({
      ...l,
      character_name: (l.characters as any)?.name ?? null,
      characters: undefined,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error listing lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/lines/:id — update line text
router.patch("/lines/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required and must be a string" });
      return;
    }

    const { data, error } = await supabase
      .from("lines")
      .update({ text, edited: true })
      .eq("id", id)
      .select("id, scene_id, character_id, text, type, sort, edited")
      .single();

    if (error) {
      res.status(404).json({ error: "Line not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Error updating line:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
