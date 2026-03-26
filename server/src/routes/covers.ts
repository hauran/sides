import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COVERS_DIR = path.join(__dirname, "../../uploads/covers");

// Ensure uploads/covers directory exists
if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

const CARD_WIDTH = 800;
const CARD_HEIGHT = 450; // 16:9 aspect ratio

/** Normalize a play title for Wikipedia lookup */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/&/g, "and")
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Fetch an image and validate it's a usable photo (not a logo/icon).
 *  Returns the downloaded buffer if usable, or null if not. */
async function fetchAndValidateImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    // Reject: PNGs with alpha (logos), tiny images, SVGs
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
    // Get image info for this file
    const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}&prop=imageinfo&iiprop=url|size|mime&format=json`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) continue;
    const infoData = await infoRes.json();

    for (const page of Object.values(infoData.query.pages) as any[]) {
      const ii = page?.imageinfo?.[0];
      if (!ii) continue;
      // Only JPEGs, reasonably large
      if (ii.mime !== "image/jpeg") continue;
      if (ii.width < 600 || ii.height < 400) continue;
      return ii.url;
    }
  }
  return null;
}

/** Fetch the best image URL and its pre-downloaded buffer.
 *  Tries Wikipedia first, falls back to Commons. */
async function findImage(title: string): Promise<{ url: string; buffer: Buffer } | null> {
  const normalized = normalizeTitle(title);
  const queries = [
    normalized,
    `${normalized} (play)`,
    `${normalized} (musical)`,
  ];

  // Try Wikipedia page summaries first
  for (const query of queries) {
    const url = await tryWikipedia(query);
    if (url) {
      const buffer = await fetchAndValidateImage(url);
      if (buffer) return { url, buffer };
    }
  }

  // Fall back to Wikimedia Commons search
  console.log(`[Covers] Wikipedia had no usable image for "${title}", searching Commons...`);
  const commonsUrl = await searchCommons(normalized);
  if (commonsUrl) {
    const buffer = await fetchAndValidateImage(commonsUrl);
    if (buffer) return { url: commonsUrl, buffer };
  }

  return null;
}

const router = Router();

// POST /api/covers/:playId — generate a smart-cropped cover for a play
router.post("/:playId", authMiddleware, async (req: Request, res: Response) => {
  const { playId } = req.params;

  try {
    // Check if cover already exists on disk
    const jpgPath = path.join(COVERS_DIR, `${playId}.jpg`);
    if (fs.existsSync(jpgPath)) {
      res.json({ cover_uri: `/api/covers/${playId}/image` });
      return;
    }

    // Get play title
    const { data: play, error: playErr } = await supabase
      .from("plays")
      .select("title")
      .eq("id", playId)
      .single();

    if (playErr || !play) {
      res.status(404).json({ error: "Play not found" });
      return;
    }

    // Find a usable image (Wikipedia → Commons fallback)
    const found = await findImage(play.title);

    if (found) {
      // Smart crop — 'attention' strategy finds the focal point
      await sharp(found.buffer)
        .resize(CARD_WIDTH, CARD_HEIGHT, {
          fit: "cover",
          position: sharp.strategy.attention,
        })
        .jpeg({ quality: 85 })
        .toFile(jpgPath);
    }

    // If no image was saved, generate a styled typographic cover
    if (!fs.existsSync(jpgPath)) {
      // Pick a gradient based on title hash for variety
      const hash = play.title.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
      const gradients = [
        ["#C4727F", "#8B6B7A"],  // rose
        ["#8B9D83", "#6B7D63"],  // sage
        ["#C49872", "#8B7360"],  // warm tan
        ["#7B8FA1", "#5B6F81"],  // steel blue
        ["#A1887F", "#7B6560"],  // mocha
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
      await sharp(Buffer.from(svg))
        .jpeg({ quality: 85 })
        .toFile(jpgPath);
    }

    console.log(`Cover generated for play ${playId}: ${jpgPath}`);

    // Update play record with cover_uri
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
router.get("/:playId/image", (req: Request, res: Response) => {
  const { playId } = req.params;
  const jpgPath = path.join(COVERS_DIR, `${playId}.jpg`);

  if (!fs.existsSync(jpgPath)) {
    res.status(404).json({ error: "Cover not found" });
    return;
  }

  res.set({
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=86400",
  });
  fs.createReadStream(jpgPath).pipe(res);
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
    const jpgPath = path.join(COVERS_DIR, `${playId}.jpg`);

    // Smart crop from square to 16:9 card dimensions
    await sharp(file.buffer)
      .resize(CARD_WIDTH, CARD_HEIGHT, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 85 })
      .toFile(jpgPath);

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

export default router;
