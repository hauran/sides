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

async function lookupUserBySession(token: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("users")
    .select("id, name")
    .eq("session_token", token)
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

    // Check for Bearer token (header or _bearer query param for audio streaming)
    const authHeader = req.headers.authorization;
    const bearerQuery = req.query._bearer as string | undefined;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : bearerQuery;
    if (bearerToken) {
      const token = bearerToken;
      const user = await lookupUserBySession(token);
      if (user) {
        req.user = user;
        next();
        return;
      }
      res.status(401).json({ error: "Invalid or expired session" });
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
      const user = await lookupUserBySession(token);
      if (user) req.user = user;
    }

    next();
  } catch (err) {
    next(err);
  }
}
