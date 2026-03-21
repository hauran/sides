import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/plays — list plays for current user
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data: memberships, error: memErr } = await supabase
      .from("play_members")
      .select("play_id, character_id, characters(name)")
      .eq("user_id", userId);
    if (memErr) throw memErr;

    if (!memberships || memberships.length === 0) {
      res.json([]);
      return;
    }

    const playIds = memberships.map((m) => m.play_id);
    const { data: plays, error: playErr } = await supabase
      .from("plays")
      .select("id, title, script_type, script_uri, created_at, created_by")
      .in("id", playIds)
      .order("created_at", { ascending: false });
    if (playErr) throw playErr;

    const memberMap = new Map(memberships.map((m) => [m.play_id, m]));
    const result = (plays ?? []).map((p) => {
      const mem = memberMap.get(p.id);
      return {
        ...p,
        character_id: mem?.character_id ?? null,
        character_name: (mem?.characters as any)?.name ?? null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error listing plays:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/plays/:id — get play with characters, scenes, members
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: play, error: playErr } = await supabase
      .from("plays")
      .select("id, title, created_by, script_type, script_uri, created_at")
      .eq("id", id)
      .single();
    if (playErr) {
      res.status(404).json({ error: "Play not found" });
      return;
    }

    const [charRes, sceneRes, memberRes] = await Promise.all([
      supabase.from("characters").select("id, name").eq("play_id", id).order("name"),
      supabase.from("scenes").select("id, name, sort").eq("play_id", id).order("sort"),
      supabase
        .from("play_members")
        .select("user_id, character_id, users(name, avatar_uri), characters(name)")
        .eq("play_id", id),
    ]);

    if (charRes.error) throw charRes.error;
    if (sceneRes.error) throw sceneRes.error;
    if (memberRes.error) throw memberRes.error;

    const members = (memberRes.data ?? []).map((m) => ({
      user_id: m.user_id,
      character_id: m.character_id,
      user_name: (m.users as any)?.name ?? null,
      avatar_uri: (m.users as any)?.avatar_uri ?? null,
      character_name: (m.characters as any)?.name ?? null,
    }));

    res.json({
      ...play,
      characters: charRes.data ?? [],
      scenes: sceneRes.data ?? [],
      members,
    });
  } catch (err) {
    console.error("Error getting play:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/plays — create a new play
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { title, script_type, script_uri } = req.body;

    if (!title || !script_type) {
      res.status(400).json({ error: "title and script_type are required" });
      return;
    }
    if (!["pdf", "photos"].includes(script_type)) {
      res.status(400).json({ error: "script_type must be 'pdf' or 'photos'" });
      return;
    }

    const { data: play, error: playErr } = await supabase
      .from("plays")
      .insert({ title, created_by: userId, script_type, script_uri: script_uri || null })
      .select()
      .single();
    if (playErr) throw playErr;

    // Auto-add creator as play member
    const { error: memErr } = await supabase
      .from("play_members")
      .insert({ play_id: play.id, user_id: userId });
    if (memErr) throw memErr;

    res.status(201).json(play);
  } catch (err) {
    console.error("Error creating play:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
