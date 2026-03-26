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
      .select("play_id")
      .eq("user_id", userId);
    if (memErr) throw memErr;

    if (!memberships || memberships.length === 0) {
      res.json([]);
      return;
    }

    const playIds = memberships.map((m) => m.play_id);
    const { data: plays, error: playErr } = await supabase
      .from("plays")
      .select("id, title, script_type, script_uri, status, progress, created_at, created_by")
      .in("id", playIds)
      .order("created_at", { ascending: false });
    if (playErr) throw playErr;

    res.json(plays ?? []);
  } catch (err) {
    console.error("Error listing plays:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/plays/:id — get play with characters, scenes, members, assignments
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: play, error: playErr } = await supabase
      .from("plays")
      .select("id, title, created_by, script_type, script_uri, status, progress, created_at")
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
        .select("user_id, users(name, avatar_uri)")
        .eq("play_id", id),
    ]);

    if (charRes.error) throw charRes.error;
    if (sceneRes.error) throw sceneRes.error;
    if (memberRes.error) throw memberRes.error;

    const characterIds = (charRes.data ?? []).map((c) => c.id);
    let assignRes: { data: any[] | null; error: any } = { data: [], error: null };
    if (characterIds.length > 0) {
      assignRes = await supabase
        .from("character_assignments")
        .select("character_id, user_id, users(name, avatar_uri)")
        .in("character_id", characterIds);
      if (assignRes.error) throw assignRes.error;
    }

    const members = (memberRes.data ?? []).map((m) => ({
      user_id: m.user_id,
      user_name: (m.users as any)?.name ?? null,
      avatar_uri: (m.users as any)?.avatar_uri ?? null,
    }));

    const assignments = (assignRes.data ?? []).map((a) => ({
      character_id: a.character_id,
      user_id: a.user_id,
      user_name: (a.users as any)?.name ?? null,
      avatar_uri: (a.users as any)?.avatar_uri ?? null,
    }));

    res.json({
      ...play,
      characters: charRes.data ?? [],
      scenes: sceneRes.data ?? [],
      members,
      assignments,
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

// POST /api/plays/:id/assign — assign current user to a character (supports multiple)
router.post("/:id/assign", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: playId } = req.params;
    const { character_id } = req.body;

    if (!character_id) {
      res.status(400).json({ error: "character_id is required" });
      return;
    }

    // Verify user is a member of this play
    const { data: membership } = await supabase
      .from("play_members")
      .select("user_id")
      .eq("play_id", playId)
      .eq("user_id", userId)
      .single();

    if (!membership) {
      res.status(403).json({ error: "You are not a member of this play" });
      return;
    }

    // Insert assignment (multiple users can play the same role)
    const { data, error } = await supabase
      .from("character_assignments")
      .upsert({ character_id, user_id: userId }, { onConflict: "character_id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error assigning character:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/plays/:id/assign/:characterId — unassign a character
router.delete("/:id/assign/:characterId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { characterId } = req.params;

    const { error } = await supabase
      .from("character_assignments")
      .delete()
      .eq("character_id", characterId)
      .eq("user_id", userId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("Error unassigning character:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/plays/:id — update play title
router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: playId } = req.params;
    const { title } = req.body;

    const updates: Record<string, string> = {};
    if (title && typeof title === "string") updates.title = title;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const { data, error } = await supabase
      .from("plays")
      .update(updates)
      .eq("id", playId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Error updating play:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/plays/:id/leave — remove current user from play (doesn't delete the play)
router.delete("/:id/leave", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: playId } = req.params;

    // Remove user's character assignments for this play
    const { data: characters } = await supabase
      .from("characters")
      .select("id")
      .eq("play_id", playId);

    if (characters && characters.length > 0) {
      const charIds = characters.map((c) => c.id);
      await supabase
        .from("character_assignments")
        .delete()
        .in("character_id", charIds)
        .eq("user_id", userId);
    }

    // Remove play membership
    const { error } = await supabase
      .from("play_members")
      .delete()
      .eq("play_id", playId)
      .eq("user_id", userId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("Error leaving play:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
