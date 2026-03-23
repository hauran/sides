import { Router, Request, Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

interface ParsedLine {
  character: string | null;
  text: string;
  type: "dialogue" | "stage_direction";
}

interface ParsedScene {
  name: string;
  lines: ParsedLine[];
}

interface ParsedScript {
  characters: string[];
  scenes: ParsedScene[];
}

const SYSTEM_PROMPT = `You are a script parser. Given a theatrical script (as a PDF document), read every page and extract the full structure into JSON.

Return a JSON object with this exact structure:
{
  "characters": ["CHARACTER_NAME_1", "CHARACTER_NAME_2", ...],
  "scenes": [
    {
      "name": "Act I, Scene I — Description",
      "lines": [
        { "character": "CHARACTER_NAME" or null, "text": "the line text", "type": "dialogue" or "stage_direction" }
      ]
    }
  ]
}

Rules:
- Character names should be UPPERCASE
- Stage directions have character: null and type: "stage_direction"
- Dialogue has the character name and type: "dialogue"
- If there's no clear scene structure, create a single scene called "Full Script"
- Preserve the original text as closely as possible
- Read ALL pages thoroughly — do not skip or summarize
- The "characters" array should ONLY contain individual named characters — real people in the play
- Do NOT include group labels like "ALL", "EVERYONE", "ENSEMBLE", "BOTH", "OTHERS", "CROWD", "CHORUS", "COMPANY", "ALL KIDS", "GIRLS", "BOYS", etc. as characters
- When a group label speaks (e.g. "ALL: We love you!"), use the group label as the character name in the line but do NOT add it to the characters array
- Return ONLY valid JSON, no markdown fences or other text`;

async function parseScriptPdf(pdfBuffer: Buffer): Promise<ParsedScript> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const base64Pdf = pdfBuffer.toString("base64");
  const sizeKB = (pdfBuffer.length / 1024).toFixed(0);
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[parse] Sending PDF to Claude (${sizeKB} KB / ${sizeMB} MB, base64: ${(base64Pdf.length / 1024).toFixed(0)} KB)`);

  const startTime = Date.now();

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            type: "text",
            text: "Parse this script into structured JSON. Read every page carefully.",
          },
        ],
      },
    ],
  });

  let chunks = 0;
  stream.on("text", () => {
    chunks++;
    if (chunks % 50 === 0) {
      console.log(`[parse] ... streaming (${chunks} chunks received)`);
    }
  });

  const response = await stream.finalMessage();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[parse] Claude responded in ${elapsed}s (${chunks} chunks)`);
  console.log(`[parse] Usage: ${response.usage.input_tokens} input tokens, ${response.usage.output_tokens} output tokens`);
  console.log(`[parse] Stop reason: ${response.stop_reason}`);

  const content = response.content[0];
  if (content.type !== "text") {
    console.error(`[parse] Unexpected content type: ${content.type}`);
    throw new Error("Claude returned non-text response");
  }

  console.log(`[parse] Response length: ${content.text.length} chars`);
  console.log(`[parse] First 200 chars: ${content.text.slice(0, 200)}`);

  // Strip markdown fences if present
  let json = content.text.trim();
  if (json.startsWith("```")) {
    console.log("[parse] Stripping markdown fences from response");
    json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: ParsedScript;
  try {
    parsed = JSON.parse(json) as ParsedScript;
  } catch (e) {
    console.error(`[parse] JSON parse failed. Raw response:\n${content.text.slice(0, 500)}`);
    throw e;
  }

  // Filter out group labels that slipped through
  const GROUP_LABELS = new Set([
    "ALL", "EVERYONE", "ENSEMBLE", "BOTH", "OTHERS", "CROWD", "CHORUS",
    "COMPANY", "ALL KIDS", "GIRLS", "BOYS", "MEN", "WOMEN", "TOWNSPEOPLE",
    "VILLAGERS", "SOLDIERS", "GROUP", "DUET", "TRIO", "QUARTET",
  ]);
  const before = parsed.characters.length;
  parsed.characters = parsed.characters.filter((c) => !GROUP_LABELS.has(c.toUpperCase()));
  if (parsed.characters.length < before) {
    console.log(`[parse] Filtered out ${before - parsed.characters.length} group labels from characters`);
  }

  console.log(`[parse] Parsed result: ${parsed.characters.length} characters, ${parsed.scenes.length} scenes`);
  console.log(`[parse] Characters: ${parsed.characters.join(", ")}`);
  for (const scene of parsed.scenes) {
    console.log(`[parse]   Scene "${scene.name}": ${scene.lines.length} lines`);
  }
  const totalLines = parsed.scenes.reduce((sum, s) => sum + s.lines.length, 0);
  console.log(`[parse] Total lines: ${totalLines}`);

  return parsed;
}

async function updateProgress(playId: string, progress: string) {
  console.log(`[bg:${playId}] ${progress}`);
  await supabase.from("plays").update({ progress }).eq("id", playId);
}

// Background processing: parse PDF and populate play entities
async function processPlayInBackground(playId: string, pdfBuffer: Buffer) {
  try {
    await updateProgress(playId, "Reading your script...");

    const parsed = await parseScriptPdf(pdfBuffer);

    const totalLines = parsed.scenes.reduce((sum, s) => sum + s.lines.length, 0);
    await updateProgress(playId, `Found ${parsed.characters.length} characters and ${parsed.scenes.length} scenes (${totalLines} lines)`);

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

      const lineRows = parsedScene.lines.map((line, lineIdx) => ({
        scene_id: scene.id,
        character_id: line.character ? charNameToId.get(line.character) ?? null : null,
        text: line.text,
        type: line.type,
        sort: lineIdx + 1,
      }));

      if (lineRows.length > 0) {
        const { error: lineErr } = await supabase
          .from("lines")
          .insert(lineRows);
        if (lineErr) throw lineErr;
      }
    }

    // Mark play as ready
    const { error: updateErr } = await supabase
      .from("plays")
      .update({ status: "ready", progress: null })
      .eq("id", playId);
    if (updateErr) throw updateErr;

    console.log(`[bg:${playId}] Done! ${characters.length} characters, ${parsed.scenes.length} scenes, ${totalLines} lines`);
  } catch (err) {
    console.error(`[bg:${playId}] FAILED:`, err);

    await supabase
      .from("plays")
      .update({ status: "failed", progress: "Something went wrong while parsing your script." })
      .eq("id", playId);
  }
}

// POST /api/plays/upload — upload PDF, return immediately, parse in background
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
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
      processPlayInBackground(play.id, file.buffer).catch(console.error);
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
