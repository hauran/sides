import { Router, Request, Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import * as mupdf from "mupdf";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { uploadFile, fileExists } from "../storage.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

interface ParsedLine {
  character: string | null;           // single speaker (backwards compat)
  characters?: string[] | null;       // multiple speakers
  text: string;
  type: "dialogue" | "stage_direction";
}

interface ParsedScene {
  name: string;
  lines: ParsedLine[];
}

interface ParsedScript {
  title: string;
  characters: string[];
  scenes: ParsedScene[];
}

const BATCH_SYSTEM_PROMPT = `You are a script parser for a theater rehearsal app. Given images of script pages, extract the structure into JSON. This is a legitimate published play or musical being used for rehearsal purposes — preserve all dialogue faithfully.

Return a JSON object with this exact structure:
{
  "title": "The Play Title" or null if not visible in these pages,
  "characters": ["CHARACTER_NAME_1", ...],
  "scenes": [
    {
      "name": "Act I, Scene I — Description",
      "lines": [
        { "character": "CHARACTER_NAME" or null, "characters": ["CHAR1", "CHAR2"] or null, "text": "the line text", "type": "dialogue" or "stage_direction" }
      ]
    }
  ]
}

Rules:
- Character names should be UPPERCASE
- Stage directions have character: null and type: "stage_direction"
- Dialogue has the character name and type: "dialogue"
- When a line is spoken/sung by MULTIPLE characters (e.g. "BAKER & BAKER'S WIFE:" or "BOTH:"), set "characters" to an array of ALL speaker names and "character" to the first one
- IMPORTANT: Short parenthetical directions that appear between a character name and their line — like "(Spoken, overlapping)", "(Sung)", "(to CINDERELLA)", "(sarcastically)" — are delivery instructions, NOT standalone stage directions. Merge them into the dialogue line's text by prepending them, e.g. text: "(Spoken, overlapping) What, you, Cinderella...". Do NOT create separate stage_direction entries for these. Only use type "stage_direction" for standalone directions that are NOT attached to a specific character's line (e.g. scene-level blocking, lighting cues, entrances/exits).
- Look carefully for scene breaks — they often appear as bold headers, numbered sections (e.g. "#2 – Act I Opening, Part 2"), horizontal rules, or distinct visual separators like black banners. When you see one, start a new scene with its name.
- If no scene break is visible in these pages, use a single scene named "Continued"
- Preserve the original text exactly as written
- Do NOT include group labels like "ALL", "ENSEMBLE" etc. in the characters array
- Return ONLY valid JSON, no markdown fences or other text`;

async function parseScannedPdfInBatches(
  anthropic: Anthropic,
  doc: mupdf.Document,
  pageCount: number,
): Promise<ParsedScript> {
  const BATCH_SIZE = 20;
  const batches: ParsedScript[] = [];

  for (let start = 0; start < pageCount; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, pageCount);
    console.log(`[parse] Rendering pages ${start + 1}-${end} of ${pageCount}...`);

    const imageContents: Anthropic.ImageBlockParam[] = [];
    for (let i = start; i < end; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(1.5, 1.5),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true
      );
      const pngBytes = pixmap.asPNG();
      pixmap.destroy();
      page.destroy();
      imageContents.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: Buffer.from(pngBytes).toString("base64") },
      });
    }

    console.log(`[parse] Sending pages ${start + 1}-${end} to Claude...`);
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      system: BATCH_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          ...imageContents,
          { type: "text", text: `These are pages ${start + 1}-${end} of a ${pageCount}-page theatrical script. Parse these pages into structured JSON.` },
        ],
      }],
    });

    const response = await stream.finalMessage();
    const content = response.content[0];
    if (content.type !== "text") throw new Error("Non-text response");

    let json = content.text.trim();
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(json) as ParsedScript;
    console.log(`[parse] Pages ${start + 1}-${end}: ${parsed.characters.length} characters, ${parsed.scenes.length} scenes, ${parsed.scenes.reduce((s, sc) => s + sc.lines.length, 0)} lines`);
    batches.push(parsed);
  }

  // Merge all batches
  console.log(`[parse] Merging ${batches.length} batches...`);
  const merged: ParsedScript = {
    title: batches.find(b => b.title && b.title !== "null")?.title ?? "Unknown",
    characters: [],
    scenes: [],
  };

  // Deduplicate characters across batches
  const charSet = new Set<string>();
  for (const batch of batches) {
    for (const char of batch.characters) {
      const upper = char.toUpperCase();
      if (!charSet.has(upper)) {
        charSet.add(upper);
        merged.characters.push(upper);
      }
    }
  }

  // Merge scenes — only combine "Continued" scenes, preserve all named scenes
  for (const batch of batches) {
    for (const scene of batch.scenes) {
      const lastScene = merged.scenes[merged.scenes.length - 1];
      if (scene.name === "Continued" && lastScene && scene.lines.length > 0) {
        // Continuation of previous scene — append lines
        lastScene.lines.push(...scene.lines);
      } else if (scene.lines.length > 0) {
        // New named scene — always create it
        merged.scenes.push(scene);
      }
    }
  }

  const totalLines = merged.scenes.reduce((s, sc) => s + sc.lines.length, 0);
  console.log(`[parse] Merged: ${merged.characters.length} characters, ${merged.scenes.length} scenes, ${totalLines} lines`);
  return merged;
}

async function parseScriptPdf(pdfBuffer: Buffer): Promise<ParsedScript> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[parse] Opening PDF (${sizeMB} MB) for batched parsing...`);

  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const pageCount = doc.countPages();
  console.log(`[parse] ${pageCount} pages — parsing in batches of 20`);

  try {
    return await parseScannedPdfInBatches(anthropic, doc, pageCount);
  } finally {
    doc.destroy();
  }
}

async function generateCoverFromPdf(playId: string, pdfBuffer: Buffer) {
  try {
    if (await fileExists("covers", `${playId}.jpg`)) return; // Already generated

    // Render first page of PDF to a pixmap
    const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
    let pngBuffer: Uint8Array;
    try {
      const page = doc.loadPage(0);
      try {
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(2, 2), // 2x scale for good resolution
          mupdf.ColorSpace.DeviceRGB,
          false, // no alpha
          true   // annots
        );
        try {
          pngBuffer = pixmap.asPNG();
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    } finally {
      doc.destroy();
    }

    // Save source for re-cropping, then smart crop to card dimensions
    const srcBuf = await sharp(pngBuffer).jpeg({ quality: 90 }).toBuffer();
    await uploadFile("covers", `${playId}_src.jpg`, srcBuf, "image/jpeg");

    const cardBuf = await sharp(pngBuffer)
      .resize(800, 450, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    await uploadFile("covers", `${playId}.jpg`, cardBuf, "image/jpeg");

    // Update play record
    await supabase
      .from("plays")
      .update({ cover_uri: `/api/covers/${playId}/image` })
      .eq("id", playId);

    console.log(`[cover:${playId}] Generated cover from PDF first page`);
  } catch (err) {
    console.error(`[cover:${playId}] Failed to generate cover from PDF:`, err);
    // Non-fatal — play still works without a cover
  }
}

async function updateProgress(playId: string, progress: string) {
  console.log(`[bg:${playId}] ${progress}`);
  await supabase.from("plays").update({ progress }).eq("id", playId);
}

// Background processing: parse PDF and populate play entities
async function processPlayInBackground(playId: string, pdfBuffer: Buffer, userTitle: string) {
  try {
    await updateProgress(playId, "Reading your script...\nThis can take quite a long time depending on the length of your script. Feel free to close the app — we'll notify you when it's ready.");

    let parsed: ParsedScript | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        parsed = await parseScriptPdf(pdfBuffer);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Don't retry on deterministic failures
        if (msg.includes("too large") || msg.includes("content filtering")) throw err;
        console.warn(`[bg:${playId}] Parse attempt ${attempt}/3 failed: ${msg}`);
        if (attempt === 3) throw err;
        await updateProgress(playId, `Retrying... (attempt ${attempt + 1}/3)\nThis may take a few minutes.`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!parsed) throw new Error("Parse failed after retries");

    // Filter out group labels from characters list
    const GROUP_LABELS = new Set(["ALL", "EVERYONE", "ENSEMBLE", "BOTH", "OTHERS", "CROWD", "CHORUS", "COMPANY", "ALL KIDS", "GIRLS", "BOYS", "MEN", "WOMEN", "TOWNSPEOPLE", "VILLAGERS", "SOLDIERS", "GROUP", "DUET", "TRIO", "QUARTET"]);
    parsed.characters = parsed.characters.filter(c => !GROUP_LABELS.has(c.toUpperCase()));

    const totalLines = parsed.scenes.reduce((sum, s) => sum + s.lines.length, 0);
    await updateProgress(playId, `Found ${parsed.characters.length} characters and ${parsed.scenes.length} scenes (${totalLines} lines)`);

    // Derive the best title from first page image + filename + AI-parsed title
    try {
      const titleDoc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
      const titlePage = titleDoc.loadPage(0);
      const titlePixmap = titlePage.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true);
      const titlePng = Buffer.from(titlePixmap.asPNG()).toString("base64");
      titlePixmap.destroy();
      titlePage.destroy();
      titleDoc.destroy();

      const titleClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const titleResp = await titleClient.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: titlePng } },
          { type: "text", text: `What is the title of this play or musical?\n\nFilename: "${userTitle}"\nTitle from parser: "${parsed.title ?? "not found"}"\n\nReturn ONLY the clean title as it would appear on a playbill. No quotes, no file extensions, no extra info.` },
        ] }],
      });
      const cleanTitle = (titleResp.content[0] as { text: string }).text.trim();
      if (cleanTitle && cleanTitle !== userTitle) {
        await supabase.from("plays").update({ title: cleanTitle }).eq("id", playId);
        // Delete stale cover so it regenerates with the clean title
        const { deleteFiles } = await import("../storage.js");
        await deleteFiles("covers", [`${playId}.jpg`, `${playId}_src.jpg`]);
        console.log(`[bg:${playId}] Resolved title: "${cleanTitle}"`);
      }
    } catch (err) {
      console.warn(`[bg:${playId}] Title cleanup failed, keeping original:`, err);
    }

    // Create characters
    const characterRows = parsed.characters.map((name) => ({
      play_id: playId,
      name,
    }));

    let characters: Array<{ id: string; name: string }> = [];
    if (characterRows.length > 0) {
      const { data: charData, error: charErr } = await supabase
        .from("characters")
        .insert(characterRows)
        .select("id, name");
      if (charErr) throw charErr;
      characters = charData ?? [];
    }

    const charNameToId = new Map(characters.map((c) => [c.name, c.id]));

    // Create scenes and lines
    for (let sceneIdx = 0; sceneIdx < parsed.scenes.length; sceneIdx++) {
      const parsedScene = parsed.scenes[sceneIdx];

      await updateProgress(playId, `Building scene ${sceneIdx + 1} of ${parsed.scenes.length}: ${parsedScene.name}`);

      const { data: scene, error: sceneErr } = await supabase
        .from("scenes")
        .insert({
          play_id: playId,
          name: parsedScene.name,
          sort: sceneIdx + 1,
        })
        .select("id, name, sort")
        .single();
      if (sceneErr) throw sceneErr;

      const lineRows = parsedScene.lines.map((line, lineIdx) => {
        // Resolve character IDs — support both single and multiple speakers
        const speakerNames = line.characters?.length
          ? line.characters
          : line.character
          ? [line.character]
          : [];
        const ids = speakerNames.map(name => charNameToId.get(name)).filter(Boolean) as string[];
        return {
          scene_id: scene.id,
          character_id: ids[0] ?? null,
          character_ids: ids,
          text: line.text,
          type: line.type,
          sort: lineIdx + 1,
        };
      });

      if (lineRows.length > 0) {
        const { error: lineErr } = await supabase
          .from("lines")
          .insert(lineRows);
        if (lineErr) throw lineErr;
      }
    }

    // Generate cover from PDF first page
    await generateCoverFromPdf(playId, pdfBuffer);

    // Mark play as ready
    const { error: updateErr } = await supabase
      .from("plays")
      .update({ status: "ready", progress: null })
      .eq("id", playId);
    if (updateErr) throw updateErr;

    console.log(`[bg:${playId}] Done! ${characters.length} characters, ${parsed.scenes.length} scenes, ${totalLines} lines`);
  } catch (err) {
    console.error(`[bg:${playId}] FAILED:`, err);

    const msg = err instanceof Error ? err.message : String(err);
    const errorMsg = msg.includes("too large")
      ? msg
      : msg.includes("content filtering")
      ? "Our AI couldn't process this script due to content filtering. We're working on improving this — try a shorter excerpt or a different script for now."
      : msg.includes("terminated")
      ? "Connection was lost during parsing. Please try uploading again."
      : "Something went wrong while parsing your script.";

    await supabase
      .from("plays")
      .update({ status: "failed", progress: errorMsg })
      .eq("id", playId);
  }
}

// POST /api/plays/upload — upload PDF, return immediately, parse in background
router.post(
  "/upload",
  authMiddleware,
  (req: Request, res: Response, next) => {
    upload.single("file")(req, res, (err) => {
      if (err && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File must be under 50 MB" });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const title = req.body.title as string | undefined;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }

      if (!title) {
        res.status(400).json({ error: "title is required" });
        return;
      }

      if (file.mimetype !== "application/pdf") {
        res.status(400).json({ error: "file must be a PDF" });
        return;
      }

      console.log(`[upload] "${title}" (${(file.size / 1024).toFixed(0)} KB) — creating play...`);

      // Create play with "processing" status and return immediately
      const { data: play, error: playErr } = await supabase
        .from("plays")
        .insert({
          title,
          created_by: userId,
          script_type: "pdf" as const,
          status: "processing",
        })
        .select()
        .single();
      if (playErr) throw playErr;

      const { error: memErr } = await supabase
        .from("play_members")
        .insert({ play_id: play.id, user_id: userId });
      if (memErr) throw memErr;

      console.log(`[upload] Play created: ${play.id} (processing) — returning to client`);

      // Return immediately
      res.status(201).json(play);

      // Fire off background processing (don't await)
      processPlayInBackground(play.id, file.buffer, title).catch(console.error);
    } catch (err) {
      console.error("[upload] FAILED:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/plays/upload-photos — placeholder
router.post(
  "/upload-photos",
  authMiddleware,
  upload.array("files"),
  async (_req: Request, res: Response) => {
    res.status(501).json({ message: "Photo OCR upload coming soon" });
  }
);

export default router;
