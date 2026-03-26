import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { uploadFile, downloadFile } from "../storage.js";

const BUCKET = "recordings";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

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

// GET /api/recordings/:id/audio — serve audio file
router.get("/recordings/:id/audio", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("recordings")
      .select("audio_uri")
      .eq("id", id)
      .single();
    if (error || !data) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }

    const buf = await downloadFile(BUCKET, data.audio_uri);
    const ext = path.extname(data.audio_uri).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".m4a": "audio/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".webm": "audio/webm",
    };
    res.set({ "Content-Type": mimeTypes[ext] || "audio/mp4" });
    res.send(buf);
  } catch (err) {
    console.error("Error serving audio:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/recordings — create recording with audio_uri (existing endpoint)
router.post("/recordings", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { line_id, audio_uri } = req.body;

    if (!line_id || !audio_uri) {
      res.status(400).json({ error: "line_id and audio_uri are required" });
      return;
    }

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

// POST /api/recordings/upload — upload audio file via multipart form
router.post(
  "/recordings/upload",
  authMiddleware,
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const lineId = req.body.line_id as string | undefined;
      const file = req.file;

      if (!lineId) {
        res.status(400).json({ error: "line_id is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ error: "audio file is required" });
        return;
      }

      // Verify line exists
      const { data: line, error: lineErr } = await supabase
        .from("lines")
        .select("id")
        .eq("id", lineId)
        .single();
      if (lineErr || !line) {
        res.status(404).json({ error: "Line not found" });
        return;
      }

      // Upload to Supabase Storage
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname) || ".m4a";
      const filename = `recording-${uniqueSuffix}${ext}`;

      await uploadFile(BUCKET, filename, file.buffer, file.mimetype || "audio/mp4");

      const { data, error } = await supabase
        .from("recordings")
        .insert({ line_id: lineId, recorded_by: userId, audio_uri: filename })
        .select()
        .single();
      if (error) throw error;

      console.log(`[recording] Uploaded ${filename} (${(file.size / 1024).toFixed(0)} KB) for line ${lineId}`);

      res.status(201).json(data);
    } catch (err) {
      console.error("Error uploading recording:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
