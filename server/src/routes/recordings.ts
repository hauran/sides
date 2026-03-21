import { Router, Request, Response } from "express";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/lines/:lineId/recordings
router.get("/lines/:lineId/recordings", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { lineId } = req.params;

    const { data, error } = await supabase
      .from("recordings")
      .select("id, line_id, recorded_by, audio_uri, recorded_at, users(name, avatar_uri)")
      .eq("line_id", lineId)
      .order("recorded_at", { ascending: false });
    if (error) throw error;

    const result = (data ?? []).map((r) => ({
      ...r,
      recorded_by_name: (r.users as any)?.name ?? null,
      recorded_by_avatar: (r.users as any)?.avatar_uri ?? null,
      users: undefined,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error listing recordings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/recordings
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { line_id, audio_uri } = req.body;

    if (!line_id || !audio_uri) {
      res.status(400).json({ error: "line_id and audio_uri are required" });
      return;
    }

    // Verify line exists
    const { data: line, error: lineErr } = await supabase
      .from("lines")
      .select("id")
      .eq("id", line_id)
      .single();
    if (lineErr || !line) {
      res.status(404).json({ error: "Line not found" });
      return;
    }

    const { data, error } = await supabase
      .from("recordings")
      .insert({ line_id, recorded_by: userId, audio_uri })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error("Error creating recording:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
