import { Router, Request, Response } from "express";
import crypto from "crypto";
import supabase from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendInviteEmail } from "../services/email.js";

const router = Router();

const INVITE_EXPIRY_DAYS = 7;
const INVITE_BASE_URL = process.env.INVITE_BASE_URL || "https://sides.app/invite";

function generateInviteToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * POST /api/plays/:playId/invite
 * Create an invite and send the email.
 */
router.post("/plays/:playId/invite", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { playId } = req.params;
    const { email, character_id } = req.body;

    if (!email || !character_id) {
      res.status(400).json({ error: "email and character_id are required" });
      return;
    }

    const normalized = email.trim().toLowerCase();

    // Validate membership, character, play, and existing invite in parallel
    const [memberResult, characterResult, playResult, existingResult] = await Promise.all([
      supabase.from("play_members").select("user_id").eq("play_id", playId).eq("user_id", req.user!.id).single(),
      supabase.from("characters").select("id, name").eq("id", character_id).eq("play_id", playId).single(),
      supabase.from("plays").select("title").eq("id", playId).single(),
      supabase.from("invites").select("id").eq("play_id", playId).eq("character_id", character_id).eq("invited_email", normalized).eq("status", "pending").single(),
    ]);

    if (!memberResult.data) {
      res.status(403).json({ error: "You are not a member of this play" });
      return;
    }
    const character = characterResult.data;
    if (!character) {
      res.status(404).json({ error: "Character not found in this play" });
      return;
    }
    const play = playResult.data;
    if (!play) {
      res.status(404).json({ error: "Play not found" });
      return;
    }
    const existing = existingResult.data;
    if (existing) {
      res.status(409).json({ error: "An invite is already pending for this person and role" });
      return;
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const { data: invite, error: insertError } = await supabase
      .from("invites")
      .insert({
        token,
        play_id: playId,
        character_id,
        invited_email: normalized,
        invited_by: req.user!.id,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, token, status, created_at, expires_at")
      .single();

    if (insertError) {
      console.error("Create invite error:", insertError);
      res.status(500).json({ error: "Failed to create invite" });
      return;
    }

    // Send the invite email
    const inviteUrl = `${INVITE_BASE_URL}/${token}`;
    await sendInviteEmail(normalized, req.user!.name, play.title, character.name, inviteUrl);

    res.json({ invite });
  } catch (err) {
    console.error("Invite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/invites/:token
 * Validate an invite token and return invite details (no auth required).
 */
router.get("/invites/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const { data: invite } = await supabase
      .from("invites")
      .select(`
        id, token, status, invited_email, expires_at,
        play_id, character_id
      `)
      .eq("token", token)
      .single();

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    if (invite.status !== "pending") {
      res.status(410).json({ error: "This invite has already been used" });
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from("invites").update({ status: "expired" }).eq("id", invite.id);
      res.status(410).json({ error: "This invite has expired" });
      return;
    }

    // Get play and character info for display
    const { data: play } = await supabase
      .from("plays")
      .select("id, title, cover_uri")
      .eq("id", invite.play_id)
      .single();

    const { data: character } = await supabase
      .from("characters")
      .select("id, name")
      .eq("id", invite.character_id)
      .single();

    res.json({
      invite: {
        token: invite.token,
        status: invite.status,
        play: play ? { id: play.id, title: play.title, cover_uri: play.cover_uri } : null,
        character: character ? { id: character.id, name: character.name } : null,
      },
    });
  } catch (err) {
    console.error("Get invite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/invites/:token/accept
 * Accept an invite — adds user as play member and assigns character.
 */
router.post("/invites/:token/accept", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const { data: invite } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (!invite) {
      res.status(404).json({ error: "Invite not found or already used" });
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from("invites").update({ status: "expired" }).eq("id", invite.id);
      res.status(410).json({ error: "This invite has expired" });
      return;
    }

    const userId = req.user!.id;

    // Add as play member (upsert — might already be a member)
    await supabase
      .from("play_members")
      .upsert({ play_id: invite.play_id, user_id: userId }, { onConflict: "play_id,user_id" });

    // Assign character (upsert)
    await supabase
      .from("character_assignments")
      .upsert(
        { character_id: invite.character_id, user_id: userId },
        { onConflict: "character_id,user_id" }
      );

    // Mark invite as accepted
    await supabase.from("invites").update({ status: "accepted" }).eq("id", invite.id);

    res.json({ play_id: invite.play_id, character_id: invite.character_id });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
