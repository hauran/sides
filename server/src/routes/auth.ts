import { Router, Request, Response } from "express";

const router = Router();

/**
 * POST /api/auth/google
 * Placeholder for Google OAuth callback.
 */
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { id_token } = req.body;

    if (!id_token) {
      res.status(400).json({ error: "id_token is required" });
      return;
    }

    // TODO: Verify the Google ID token with Google's API
    // 1. Verify token with google-auth-library
    // 2. Extract user info (email, name, picture)
    // 3. Find or create user in database
    // 4. Generate session token
    // 5. Return session token + user info

    res.status(501).json({
      error: "Google OAuth not yet implemented",
      message: "This endpoint will verify Google ID tokens and return a session.",
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/snapchat
 * Placeholder for Snapchat OAuth callback.
 */
router.post("/snapchat", async (req: Request, res: Response) => {
  try {
    const { auth_code } = req.body;

    if (!auth_code) {
      res.status(400).json({ error: "auth_code is required" });
      return;
    }

    // TODO: Exchange Snapchat auth code for access token
    // 1. Exchange code with Snap Kit Login Kit API
    // 2. Fetch user profile from Snapchat
    // 3. Find or create user in database
    // 4. Generate session token
    // 5. Return session token + user info

    res.status(501).json({
      error: "Snapchat OAuth not yet implemented",
      message: "This endpoint will exchange Snapchat auth codes and return a session.",
    });
  } catch (err) {
    console.error("Snapchat auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
