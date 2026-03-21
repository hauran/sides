import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/plays/:playId/scenes — list scenes for a play
router.get("/plays/:playId/scenes", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;

    const { data: scenes, error } = await supabase
      .from("scenes")
      .select("id, play_id, name, sort")
      .eq("play_id", playId)
      .order("sort");
    if (error) throw error;

    res.json(scenes ?? []);
  } catch (err) {
    console.error("Error listing scenes:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scenes/:id — get a scene with its lines
router.get("/scenes/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: scene, error: sceneErr } = await supabase
      .from("scenes")
      .select("id, play_id, name, sort")
      .eq("id", id)
      .single();
    if (sceneErr) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    const { data: lines, error: linesErr } = await supabase
      .from("lines")
      .select("id, scene_id, character_id, text, type, sort, edited, characters(name)")
      .eq("scene_id", id)
      .order("sort");
    if (linesErr) throw linesErr;

    const formattedLines = (lines ?? []).map((l) => ({
      id: l.id,
      scene_id: l.scene_id,
      character_id: l.character_id,
      text: l.text,
      type: l.type,
      sort: l.sort,
      edited: l.edited,
      character_name: (l.characters as any)?.name ?? null,
    }));

    res.json({ ...scene, lines: formattedLines });
  } catch (err) {
    console.error("Error getting scene:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
