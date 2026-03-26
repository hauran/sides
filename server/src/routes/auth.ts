import { Router, Request, Response } from "express";
import crypto from "crypto";
import supabase from "../db/index.js";
import { sendVerificationCode } from "../services/email.js";

const router = Router();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * POST /api/auth/email/send-code
 * Send a 6-digit verification code to the given email.
 */
router.post("/email/send-code", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const normalized = email.trim().toLowerCase();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any existing unused codes for this email
    await supabase
      .from("email_codes")
      .update({ used: true })
      .eq("email", normalized)
      .eq("used", false);

    // Insert new code
    const { error: insertError } = await supabase.from("email_codes").insert({
      email: normalized,
      code,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Insert code error:", insertError);
      res.status(500).json({ error: "Failed to generate code" });
      return;
    }

    // Send email
    await sendVerificationCode(normalized, code);

    res.json({ ok: true });
  } catch (err) {
    console.error("Send code error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/email/verify
 * Verify the code and return a session token + user.
 * Creates the user if they don't exist yet (requires `name` in body).
 */
router.post("/email/verify", async (req: Request, res: Response) => {
  try {
    const { email, code, name } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: "email and code are required" });
      return;
    }

    const normalized = email.trim().toLowerCase();

    // Find the most recent unused code for this email
    const { data: codeRow, error: lookupError } = await supabase
      .from("email_codes")
      .select("*")
      .eq("email", normalized)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lookupError || !codeRow) {
      res.status(400).json({ error: "No pending verification code. Request a new one." });
      return;
    }

    // Check expiry
    if (new Date(codeRow.expires_at) < new Date()) {
      await supabase.from("email_codes").update({ used: true }).eq("id", codeRow.id);
      res.status(400).json({ error: "Code expired. Request a new one." });
      return;
    }

    // Check attempts
    if (codeRow.attempts >= 3) {
      await supabase.from("email_codes").update({ used: true }).eq("id", codeRow.id);
      res.status(400).json({ error: "Too many attempts. Request a new code." });
      return;
    }

    // Increment attempts
    await supabase
      .from("email_codes")
      .update({ attempts: codeRow.attempts + 1 })
      .eq("id", codeRow.id);

    // Check code
    if (codeRow.code !== code.trim()) {
      const remaining = 2 - codeRow.attempts;
      res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
      return;
    }

    // Find or create user
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, email, name, avatar_uri")
      .eq("email", normalized)
      .single();

    let user;
    const sessionToken = generateToken();

    if (existingUser) {
      // Code is correct — mark used
      await supabase.from("email_codes").update({ used: true }).eq("id", codeRow.id);
      // Update session token
      await supabase
        .from("users")
        .update({ session_token: sessionToken })
        .eq("id", existingUser.id);
      user = existingUser;
    } else {
      // New user — name required. Don't mark code as used yet so they can retry with name.
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required for new accounts", needs_name: true });
        return;
      }

      // Now mark used
      await supabase.from("email_codes").update({ used: true }).eq("id", codeRow.id);

      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          email: normalized,
          name: name.trim(),
          session_token: sessionToken,
        })
        .select("id, email, name, avatar_uri")
        .single();

      if (createError) {
        console.error("Create user error:", createError);
        res.status(500).json({ error: "Failed to create account" });
        return;
      }
      user = newUser;
    }

    // Auto-accept pending invites (non-blocking — don't fail login if this errors)
    Promise.resolve(
      supabase.from("invites").select("id, play_id, character_id").eq("invited_email", normalized).eq("status", "pending")
    ).then(({ data: pendingInvites }) => {
      if (!pendingInvites?.length) return;
      return Promise.all(pendingInvites.map((invite) =>
        Promise.all([
          supabase.from("play_members").upsert({ play_id: invite.play_id, user_id: user.id }, { onConflict: "play_id,user_id" }),
          supabase.from("character_assignments").upsert({ character_id: invite.character_id, user_id: user.id }, { onConflict: "character_id,user_id" }),
          supabase.from("invites").update({ status: "accepted" }).eq("id", invite.id),
        ])
      ));
    }).catch((err: unknown) => console.error("Auto-accept invites error:", err));

    res.json({ token: sessionToken, user });
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/google
 * Verify a Google ID token and return a session.
 */
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { id_token, name } = req.body;

    if (!id_token) {
      res.status(400).json({ error: "id_token is required" });
      return;
    }

    // Verify the Google ID token
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
    );

    if (!googleRes.ok) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    const googleUser = (await googleRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    if (!googleUser.sub || !googleUser.email) {
      res.status(401).json({ error: "Invalid Google token payload" });
      return;
    }

    const sessionToken = generateToken();

    // Check if user exists by google_id
    const { data: existingByGoogle } = await supabase
      .from("users")
      .select("id, email, name, avatar_uri")
      .eq("google_id", googleUser.sub)
      .single();

    if (existingByGoogle) {
      await supabase
        .from("users")
        .update({ session_token: sessionToken })
        .eq("id", existingByGoogle.id);
      res.json({ token: sessionToken, user: existingByGoogle });
      return;
    }

    // Check if user exists by email (link Google to existing email account)
    const { data: existingByEmail } = await supabase
      .from("users")
      .select("id, email, name, avatar_uri")
      .eq("email", googleUser.email.toLowerCase())
      .single();

    if (existingByEmail) {
      await supabase
        .from("users")
        .update({ google_id: googleUser.sub, session_token: sessionToken })
        .eq("id", existingByEmail.id);
      res.json({ token: sessionToken, user: existingByEmail });
      return;
    }

    // Create new user
    const userName = name || googleUser.name || googleUser.email.split("@")[0];
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert({
        email: googleUser.email.toLowerCase(),
        name: userName,
        google_id: googleUser.sub,
        avatar_uri: googleUser.picture || null,
        session_token: sessionToken,
      })
      .select("id, email, name, avatar_uri")
      .single();

    if (createError) {
      console.error("Create Google user error:", createError);
      res.status(500).json({ error: "Failed to create account" });
      return;
    }

    res.json({ token: sessionToken, user: newUser });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
