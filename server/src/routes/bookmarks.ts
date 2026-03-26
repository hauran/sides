import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// POST /api/bookmarks — add a bookmark (upsert)
router.post("/bookmarks", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { line_id } = req.body;

    if (!line_id) {
      res.status(400).json({ error: "line_id is required" });
      return;
    }

    const { data, error } = await supabase
      .from("bookmarks")
      .upsert({ line_id, user_id: userId }, { onConflict: "line_id,user_id" })
      .select("id, line_id, user_id, created_at")
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error creating bookmark:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/bookmarks/:lineId — remove a bookmark
router.delete("/bookmarks/:lineId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { lineId } = req.params;

    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("line_id", lineId)
      .eq("user_id", userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bookmark:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/plays/:playId/bookmarks — get user's bookmarks for a play
router.get("/plays/:playId/bookmarks", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { playId } = req.params;

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

    // Get bookmarks for lines in these scenes
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from("bookmarks")
      .select("id, line_id, user_id, created_at, lines(id, text, sort, scene_id, character_id, character_ids)")
      .eq("user_id", userId)
      .in("lines.scene_id", sceneIds);
    if (bookmarksError) throw bookmarksError;

    // Filter out bookmarks where the line join returned null (not in this play)
    const validBookmarks = (bookmarks ?? []).filter((b: any) => b.lines);

    const charMap = new Map((charsRes.data ?? []).map((c) => [c.id, c.name]));
    const sceneMap = new Map(scenes.map((s) => [s.id, { name: s.name, sort: s.sort }]));

    const result = validBookmarks.map((b: any) => {
      const line = b.lines;
      const ids: string[] = line.character_ids?.length > 0 ? line.character_ids : (line.character_id ? [line.character_id] : []);
      const names = ids.map((id: string) => charMap.get(id)).filter(Boolean);
      const scene = sceneMap.get(line.scene_id);

      return {
        id: b.id,
        line_id: b.line_id,
        user_id: b.user_id,
        created_at: b.created_at,
        line_text: line.text,
        line_sort: line.sort,
        scene_id: line.scene_id,
        scene_name: scene?.name ?? null,
        scene_sort: scene?.sort ?? 0,
        character_name: names.length > 0 ? names.join(" / ") : null,
      };
    });

    // Sort by scene sort, then line sort
    result.sort((a: any, b: any) => {
      if (a.scene_sort !== b.scene_sort) return a.scene_sort - b.scene_sort;
      return a.line_sort - b.line_sort;
    });

    res.json(result);
  } catch (err) {
    console.error("Error listing bookmarks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
