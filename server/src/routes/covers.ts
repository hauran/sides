import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { uploadFile, downloadFile, deleteFiles, fileExists, publicUrl } from "../storage.js";

const BUCKET = "covers";
const CARD_WIDTH = 800;
const CARD_HEIGHT = 450; // 16:9 aspect ratio

/** Normalize a play title for Wikipedia lookup */
const SMALL_WORDS = new Set(["a", "an", "the", "and", "but", "or", "for", "nor", "of", "in", "on", "at", "to", "by", "is"]);
function normalizeTitle(raw: string): string {
  return raw
    .replace(/&/g, "and")
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Fetch an image and validate it's a usable photo (not a logo/icon). */
async function fetchAndValidateImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (meta.format === "png" && meta.hasAlpha) return null;
    if (meta.format === "svg") return null;
    if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 300) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Try fetching an image URL from Wikipedia for a query string */
async function tryWikipedia(query: string): Promise<string | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.originalimage?.source ?? data.thumbnail?.source ?? null;
}

/** Search Wikimedia Commons for a photo related to the title */
async function searchCommons(title: string): Promise<string | null> {
  const searchTerms = `"${title}"`;
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerms)}&srnamespace=6&srlimit=10&format=json`;
  const res = await fetch(searchUrl);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data?.query?.search ?? [];

  for (const result of results) {
    const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}&prop=imageinfo&iiprop=url|size|mime&format=json`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) continue;
    const infoData = await infoRes.json();

    for (const page of Object.values(infoData.query.pages) as any[]) {
      const ii = page?.imageinfo?.[0];
      if (!ii) continue;
      if (ii.mime !== "image/jpeg") continue;
      if (ii.width < 600 || ii.height < 400) continue;
      return ii.url;
    }
  }
  return null;
}

/** Fetch the best image URL and its pre-downloaded buffer. */
async function findImage(title: string): Promise<{ url: string; buffer: Buffer } | null> {
  const normalized = normalizeTitle(title);
  const queries = [
    normalized,
    `${normalized} (play)`,
    `${normalized} (musical)`,
  ];

  for (const query of queries) {
    const url = await tryWikipedia(query);
    if (url) {
      const buffer = await fetchAndValidateImage(url);
      if (buffer) return { url, buffer };
    }
  }

  console.log(`[Covers] Wikipedia had no usable image for "${title}", searching Commons...`);
  const commonsUrl = await searchCommons(normalized);
  if (commonsUrl) {
    const buffer = await fetchAndValidateImage(commonsUrl);
    if (buffer) return { url: commonsUrl, buffer };
  }

  return null;
}

/** Smart-crop a buffer to card dimensions and return the JPEG buffer. */
async function cropToCard(input: Buffer | Uint8Array, options?: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  let pipeline = sharp(input);
  if (options) pipeline = pipeline.extract(options);
  return pipeline
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 85 })
    .toBuffer();
}

const router = Router();

// POST /api/covers/:playId — generate a smart-cropped cover for a play
router.post("/:playId", authMiddleware, async (req: Request, res: Response) => {
  const { playId } = req.params;

  try {
    if (await fileExists(BUCKET, `${playId}.jpg`)) {
      res.json({ cover_uri: `/api/covers/${playId}/image` });
      return;
    }

    const { data: play, error: playErr } = await supabase
      .from("plays")
      .select("title, status")
      .eq("id", playId)
      .single();

    if (playErr || !play) {
      res.status(404).json({ error: "Play not found" });
      return;
    }

    if (play.status === "processing") {
      res.status(202).json({ pending: true });
      return;
    }

    const found = await findImage(play.title);

    if (found) {
      const srcBuf = await sharp(found.buffer).jpeg({ quality: 90 }).toBuffer();
      await uploadFile(BUCKET, `${playId}_src.jpg`, srcBuf, "image/jpeg");
      const cardBuf = await cropToCard(found.buffer);
      await uploadFile(BUCKET, `${playId}.jpg`, cardBuf, "image/jpeg");
    }

    if (!(await fileExists(BUCKET, `${playId}.jpg`))) {
      // Generate typographic gradient cover
      const hash = play.title.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const gradients = [
        ["#C4727F", "#8B6B7A"],
        ["#8B9D83", "#6B7D63"],
        ["#C49872", "#8B7360"],
        ["#7B8FA1", "#5B6F81"],
        ["#A1887F", "#7B6560"],
      ];
      const [c1, c2] = gradients[hash % gradients.length];
      const escapedTitle = play.title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${c1}"/>
            <stop offset="100%" style="stop-color:${c2}"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <text x="60" y="${CARD_HEIGHT - 60}" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="rgba(255,255,255,0.15)" letter-spacing="4">${escapedTitle.toUpperCase()}</text>
      </svg>`;
      const cardBuf = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
      await uploadFile(BUCKET, `${playId}.jpg`, cardBuf, "image/jpeg");
    }

    console.log(`Cover generated for play ${playId}`);

    await supabase
      .from("plays")
      .update({ cover_uri: `/api/covers/${playId}/image` })
      .eq("id", playId);

    res.json({ cover_uri: `/api/covers/${playId}/image` });
  } catch (err) {
    console.error("Cover generation error:", err);
    res.status(500).json({ error: "Failed to generate cover" });
  }
});

// GET /api/covers/:playId/image — serve the cover image
router.get("/:playId/image", async (req: Request, res: Response) => {
  const { playId } = req.params;

  try {
    const buf = await downloadFile(BUCKET, `${playId}.jpg`);
    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    });
    res.send(buf);
  } catch {
    res.status(404).json({ error: "Cover not found" });
  }
});

// POST /api/covers/:playId/upload — upload a custom cover image
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.post("/:playId/upload", authMiddleware, (req: Request, res: Response, next) => {
  coverUpload.single("image")(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Image must be under 25 MB" });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const { playId } = req.params;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "image file is required" });
    return;
  }

  try {
    const srcBuf = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
    await uploadFile(BUCKET, `${playId}_src.jpg`, srcBuf, "image/jpeg");

    const cardBuf = await cropToCard(file.buffer);
    await uploadFile(BUCKET, `${playId}.jpg`, cardBuf, "image/jpeg");

    const coverUri = `/api/covers/${playId}/image`;
    await supabase
      .from("plays")
      .update({ cover_uri: coverUri })
      .eq("id", playId);

    console.log(`Cover uploaded for play ${playId}`);
    res.json({ cover_uri: coverUri });
  } catch (err) {
    console.error("Cover upload error:", err);
    res.status(500).json({ error: "Failed to upload cover" });
  }
});

// DELETE /api/covers/:playId — delete cached cover + source so it regenerates
router.delete("/:playId", authMiddleware, async (req: Request, res: Response) => {
  const { playId } = req.params;
  await deleteFiles(BUCKET, [`${playId}.jpg`, `${playId}_src.jpg`]);
  res.json({ ok: true });
});

// GET /api/covers/:playId/source — serve the full source image for cropping UI
router.get("/:playId/source", authMiddleware, async (req: Request, res: Response) => {
  const { playId } = req.params;
  try {
    const buf = await downloadFile(BUCKET, `${playId}_src.jpg`);
    res.set({ "Content-Type": "image/jpeg" });
    res.send(buf);
  } catch {
    res.status(404).json({ error: "Source image not found" });
  }
});

// PATCH /api/covers/:playId/crop — re-crop the cover from source using pan/zoom params
router.patch("/:playId/crop", authMiddleware, async (req: Request, res: Response) => {
  const { playId } = req.params;
  const { x = 0, y = 0, zoom = 1 } = req.body as { x?: number; y?: number; zoom?: number };

  try {
    // Try source first, fall back to cropped
    let srcBuf: Buffer;
    try {
      srcBuf = await downloadFile(BUCKET, `${playId}_src.jpg`);
    } catch {
      try {
        srcBuf = await downloadFile(BUCKET, `${playId}.jpg`);
      } catch {
        res.status(404).json({ error: "No cover image found" });
        return;
      }
    }

    const meta = await sharp(srcBuf).metadata();
    const srcW = meta.width!;
    const srcH = meta.height!;

    const viewW = srcW / zoom;
    const viewH = srcH / zoom;

    const left = Math.round(Math.max(0, Math.min(x * srcW, srcW - viewW)));
    const top = Math.round(Math.max(0, Math.min(y * srcH, srcH - viewH)));
    const width = Math.round(Math.min(viewW, srcW - left));
    const height = Math.round(Math.min(viewH, srcH - top));

    const cardBuf = await cropToCard(srcBuf, { left, top, width, height });
    await uploadFile(BUCKET, `${playId}.jpg`, cardBuf, "image/jpeg");

    res.json({ cover_uri: `/api/covers/${playId}/image` });
  } catch (err) {
    console.error("Cover crop error:", err);
    res.status(500).json({ error: "Failed to crop cover" });
  }
});

export default router;
