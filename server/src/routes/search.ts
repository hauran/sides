import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/plays/:playId/search?q=text — search lines by text
router.get("/plays/:playId/search", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;
    const q = (req.query.q as string ?? "").trim();

    if (!q) {
      res.json([]);
      return;
    }

    // Fetch scenes and characters in parallel
    const [scenesRes, charsRes] = await Promise.all([
      supabase.from("scenes").select("id, name, sort").eq("play_id", playId).order("sort"),
      supabase.from("characters").select("id, name").eq("play_id", playId),
    ]);
    if (scenesRes.error) throw scenesRes.error;
    const scenes = scenesRes.data ?? [];
    const sceneIds = scenes.map((s) => s.id);
    if (sceneIds.length === 0) {
      res.json([]);
      return;
    }

    // Search lines by text using ILIKE
    const { data: lines, error: linesError } = await supabase
      .from("lines")
      .select("id, text, type, sort, scene_id, character_id, character_ids")
      .in("scene_id", sceneIds)
      .ilike("text", `%${q}%`)
      .order("sort")
      .limit(50);
    if (linesError) throw linesError;

    const charMap = new Map((charsRes.data ?? []).map((c) => [c.id, c.name]));
    const sceneMap = new Map(scenes.map((s) => [s.id, { name: s.name, sort: s.sort }]));

    const result = (lines ?? []).map((l) => {
      const ids: string[] = l.character_ids?.length > 0 ? l.character_ids : (l.character_id ? [l.character_id] : []);
      const names = ids.map((id: string) => charMap.get(id)).filter(Boolean);
      const scene = sceneMap.get(l.scene_id);

      return {
        id: l.id,
        text: l.text,
        type: l.type,
        scene_id: l.scene_id,
        scene_name: scene?.name ?? null,
        scene_sort: scene?.sort ?? 0,
        character_name: names.length > 0 ? names.join(" / ") : null,
        sort: l.sort,
      };
    });

    // Sort by scene sort, then line sort
    result.sort((a, b) => {
      if (a.scene_sort !== b.scene_sort) return a.scene_sort - b.scene_sort;
      return a.sort - b.sort;
    });

    res.json(result);
  } catch (err) {
    console.error("Error searching lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
