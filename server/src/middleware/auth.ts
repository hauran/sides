import { Request, Response, NextFunction } from "express";
import supabase from "../db/index.js";

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

async function lookupUser(id: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", id)
    .single();
  return data;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Dev mode: accept x-dev-user-id header or _dev_user_id query param
    const devUserId = (req.headers["x-dev-user-id"] ?? req.query._dev_user_id) as string | undefined;
    if (process.env.NODE_ENV !== "production" && devUserId) {
      const user = await lookupUser(devUserId);
      if (user) {
        req.user = user;
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
        const user = await lookupUser(token);
        if (user) {
          req.user = user;
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

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devUserId = req.headers["x-dev-user-id"] as string | undefined;
    if (process.env.NODE_ENV !== "production" && devUserId) {
      const user = await lookupUser(devUserId);
      if (user) req.user = user;
    }

    const authHeader = req.headers.authorization;
    if (!req.user && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (process.env.NODE_ENV !== "production") {
        const user = await lookupUser(token);
        if (user) req.user = user;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
