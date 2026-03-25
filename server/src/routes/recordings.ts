import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads/recordings");

// Ensure uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".m4a";
    cb(null, `recording-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    // Accept common audio types
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

    // audio_uri is stored as a relative filename inside UPLOADS_DIR
    const filePath = path.resolve(UPLOADS_DIR, path.basename(data.audio_uri));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Audio file not found" });
      return;
    }

    res.sendFile(filePath);
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
        // Clean up uploaded file
        fs.unlink(file.path, () => {});
        res.status(404).json({ error: "Line not found" });
        return;
      }

      // Store just the filename — we serve via /api/recordings/:id/audio
      const audioUri = file.filename;

      const { data, error } = await supabase
        .from("recordings")
        .insert({ line_id: lineId, recorded_by: userId, audio_uri: audioUri })
        .select()
        .single();
      if (error) throw error;

      console.log(`[recording] Uploaded ${file.filename} (${(file.size / 1024).toFixed(0)} KB) for line ${lineId}`);

      res.status(201).json(data);
    } catch (err) {
      console.error("Error uploading recording:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
