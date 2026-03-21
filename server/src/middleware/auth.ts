import { Request, Response, NextFunction } from "express";
import pool from "../db/index.js";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
      };
    }
  }
}

/**
 * Auth middleware placeholder.
 *
 * In production, this will validate a Bearer token (OAuth).
 * In development, it accepts an `x-dev-user-id` header to bypass auth.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Dev mode: accept x-dev-user-id header
    const devUserId = req.headers["x-dev-user-id"] as string | undefined;
    if (process.env.NODE_ENV !== "production" && devUserId) {
      const result = await pool.query("SELECT id, name FROM users WHERE id = $1", [devUserId]);
      if (result.rows.length > 0) {
        req.user = { id: result.rows[0].id, name: result.rows[0].name };
        next();
        return;
      }
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      // TODO: Validate token with OAuth provider (Google/Snapchat)
      // For now, treat the token as a user ID for development
      if (process.env.NODE_ENV !== "production") {
        const result = await pool.query("SELECT id, name FROM users WHERE id = $1", [token]);
        if (result.rows.length > 0) {
          req.user = { id: result.rows[0].id, name: result.rows[0].name };
          next();
          return;
        }
      }

      res.status(401).json({ error: "Invalid token" });
      return;
    }

    res.status(401).json({ error: "Authorization required" });
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth - attaches user if present but doesn't reject if missing.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devUserId = req.headers["x-dev-user-id"] as string | undefined;
    if (process.env.NODE_ENV !== "production" && devUserId) {
      const result = await pool.query("SELECT id, name FROM users WHERE id = $1", [devUserId]);
      if (result.rows.length > 0) {
        req.user = { id: result.rows[0].id, name: result.rows[0].name };
      }
    }

    const authHeader = req.headers.authorization;
    if (!req.user && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (process.env.NODE_ENV !== "production") {
        const result = await pool.query("SELECT id, name FROM users WHERE id = $1", [token]);
        if (result.rows.length > 0) {
          req.user = { id: result.rows[0].id, name: result.rows[0].name };
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
