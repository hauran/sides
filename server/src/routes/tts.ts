import { Router, Request, Response } from "express";
import crypto from "crypto";
import { authMiddleware } from "../middleware/auth.js";

// In-memory TTS audio cache keyed by hash(character + text)
const audioCache = new Map<string, Buffer>();

function cacheKey(character: string, text: string): string {
  return crypto
    .createHash("sha256")
    .update(character + ":" + text)
    .digest("hex")
    .slice(0, 16);
}

const VOICE_MAP: Record<string, string> = {
  ROMEO: "pNInz6obpgDQGcFmaJgB",
  JULIET: "21m00Tcm4TlvDq8ikWAM",
  NURSE: "ThT5KcBeYPX3keUQqHPh",
  BENVOLIO: "VR6AewLTigWG4xSOukaG",
  MERCUTIO: "TxGEqnHWrfWFTfGW9XjX",
  DEFAULT: "ErXwobaYiN019PkySvjV",
};

const router = Router();

// POST /api/tts — generate speech audio for a line
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { text, character } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const charKey = (character ?? "DEFAULT").toUpperCase();
    const key = cacheKey(charKey, text);

    // Check cache first
    const cached = audioCache.get(key);
    if (cached) {
      console.log(`TTS cache hit [POST] key=${key} character=${charKey}`);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.length.toString(),
      });
      res.send(cached);
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "ElevenLabs API key not configured" });
      return;
    }

    const voiceId = VOICE_MAP[charKey] ?? VOICE_MAP.DEFAULT;

    console.log(`TTS cache miss [POST] key=${key} character=${charKey} — fetching from ElevenLabs`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs error:", response.status, errText);
      res.status(502).json({ error: "TTS generation failed" });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store in cache
    audioCache.set(key, buffer);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tts?text=...&character=... — streamable URL for audio players
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const text = req.query.text as string;
    const character = req.query.character as string;

    if (!text) {
      res.status(400).json({ error: "text query param is required" });
      return;
    }

    const charKey = (character ?? "DEFAULT").toUpperCase();
    const key = cacheKey(charKey, text);

    // Check cache first
    const cached = audioCache.get(key);
    if (cached) {
      console.log(`TTS cache hit [GET] key=${key} character=${charKey}`);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.length.toString(),
      });
      res.send(cached);
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "ElevenLabs API key not configured" });
      return;
    }

    const voiceId = VOICE_MAP[charKey] ?? VOICE_MAP.DEFAULT;

    console.log(`TTS cache miss [GET] key=${key} character=${charKey} — fetching from ElevenLabs`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs error:", response.status, errText);
      res.status(502).json({ error: "TTS generation failed" });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store in cache
    audioCache.set(key, buffer);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
