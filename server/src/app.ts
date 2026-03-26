import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import playsRoutes from "./routes/plays.js";
import scenesRoutes from "./routes/scenes.js";
import linesRoutes from "./routes/lines.js";
import charactersRoutes from "./routes/characters.js";
import recordingsRoutes from "./routes/recordings.js";
import usersRoutes from "./routes/users.js";
import ttsRoutes from "./routes/tts.js";
import uploadRoutes from "./routes/upload.js";
import coversRoutes from "./routes/covers.js";
import bookmarksRoutes from "./routes/bookmarks.js";
import searchRoutes from "./routes/search.js";
import inviteRoutes from "./routes/invites.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/plays", playsRoutes);
app.use("/api", scenesRoutes);   // /api/plays/:playId/scenes and /api/scenes/:id
app.use("/api", linesRoutes);    // /api/scenes/:sceneId/lines and /api/lines/:id
app.use("/api", charactersRoutes); // /api/plays/:playId/characters
app.use("/api", recordingsRoutes); // /api/lines/:lineId/recordings and /api/recordings
app.use("/api/users", usersRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/plays", uploadRoutes);
app.use("/api/covers", coversRoutes);
app.use("/api", bookmarksRoutes);  // /api/bookmarks and /api/plays/:playId/bookmarks
app.use("/api", searchRoutes);     // /api/plays/:playId/search
app.use("/api", inviteRoutes);     // /api/plays/:playId/invite, /api/invites/:token

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
