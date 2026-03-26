import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { uploadFile, downloadFile } from "../storage.js";

const router = Router();

// GET /api/users/me
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabase
      .from("users")
      .select("id, name, avatar_uri, created_at")
      .eq("id", userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Error getting user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/me
router.patch("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, avatar_uri } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      updates.name = name.trim();
    }
    if (avatar_uri !== undefined) {
      updates.avatar_uri = avatar_uri;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update. Provide name or avatar_uri." });
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, name, avatar_uri, created_at")
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/me/avatar — upload avatar photo
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post("/me/avatar", authMiddleware, (req: Request, res: Response, next) => {
  avatarUpload.single("avatar")(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Image must be under 10 MB" });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "avatar file is required" });
    return;
  }

  try {
    const buf = await sharp(file.buffer)
      .resize(256, 256, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    await uploadFile("avatars", `${userId}.jpg`, buf, "image/jpeg");

    const avatarUri = `/api/users/${userId}/avatar`;
    await supabase
      .from("users")
      .update({ avatar_uri: avatarUri })
      .eq("id", userId);

    res.json({ avatar_uri: avatarUri });
  } catch (err) {
    console.error("Avatar upload error:", err);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

// GET /api/users/:id/avatar — serve avatar image
router.get("/:id/avatar", async (req: Request, res: Response) => {
  try {
    const buf = await downloadFile("avatars", `${req.params.id}.jpg`);
    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    });
    res.send(buf);
  } catch {
    res.status(404).json({ error: "Avatar not found" });
  }
});

export default router;
