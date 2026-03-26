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
      .select("id, scene_id, character_id, character_ids, text, type, sort, edited, hidden, characters(name)")
      .eq("scene_id", sceneId)
      .order("sort");
    if (error) throw error;

    // Fetch all characters for this scene's play to resolve names
    const sceneRes = await supabase.from("scenes").select("play_id").eq("id", sceneId).single();
    const playId = sceneRes.data?.play_id;
    let charMap = new Map<string, string>();
    if (playId) {
      const { data: chars } = await supabase.from("characters").select("id, name").eq("play_id", playId);
      charMap = new Map((chars ?? []).map(c => [c.id, c.name]));
    }

    const result = (lines ?? []).map((l) => {
      const ids: string[] = l.character_ids?.length > 0 ? l.character_ids : (l.character_id ? [l.character_id] : []);
      const names = ids.map(id => charMap.get(id)).filter(Boolean);
      return {
        ...l,
        character_ids: ids,
        character_name: names.length > 0 ? names.join(" / ") : null,
        characters: undefined,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error listing lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/lines/:id — update line text and/or character assignment
router.patch("/lines/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text, character_ids, hidden } = req.body;

    const updates: Record<string, unknown> = {};
    if (text && typeof text === "string") {
      updates.text = text;
      updates.edited = true;
    }
    if (character_ids !== undefined) {
      const ids = Array.isArray(character_ids) ? character_ids : [];
      updates.character_ids = ids;
      updates.character_id = ids[0] ?? null; // keep primary in sync
      updates.edited = true;
    }
    if (typeof hidden === "boolean") {
      updates.hidden = hidden;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "text, character_ids, or hidden is required" });
      return;
    }

    const { data, error } = await supabase
      .from("lines")
      .update(updates)
      .eq("id", id)
      .select("id, scene_id, character_id, character_ids, text, type, sort, edited, hidden")
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
