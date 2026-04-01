import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import { getBindStatus, startBindSession } from "./weixin.js";
import type { StartBindRequest } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const PORT = Number(process.env.PORT ?? 8787);
const DEFAULT_BASE_URL =
  process.env.WXBOT_BIND_DEFAULT_BASE_URL?.trim() || "https://ilinkai.weixin.qq.com";
const DEFAULT_BOT_TYPE = process.env.WXBOT_BIND_DEFAULT_BOT_TYPE?.trim() || "3";
const DEFAULT_ROUTE_TAG = process.env.WXBOT_BIND_ROUTE_TAG?.trim() || undefined;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim();

const app = express();

app.use(express.json());
app.use(
  cors(
    FRONTEND_ORIGIN
      ? {
          origin: FRONTEND_ORIGIN,
        }
      : undefined,
  ),
);

app.get("/api/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "wxbot-bind-backend",
    now: new Date().toISOString(),
  });
});

app.post("/api/bind/start", async (req, res) => {
  try {
    const body = (req.body ?? {}) as StartBindRequest;
    const baseUrl = body.baseUrl?.trim() || DEFAULT_BASE_URL;
    const botType = body.botType?.trim() || DEFAULT_BOT_TYPE;
    const routeTag = body.routeTag?.trim() || DEFAULT_ROUTE_TAG;

    const result = await startBindSession({
      baseUrl,
      botType,
      routeTag,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

app.get("/api/bind/status", async (req, res) => {
  const sessionKey = String(req.query.sessionKey ?? "").trim();
  if (!sessionKey) {
    res.status(400).json({
      ok: false,
      error: "Missing sessionKey query parameter.",
    });
    return;
  }

  try {
    const result = await getBindStatus(sessionKey);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({
      ok: false,
      error: message,
    });
  }
});

app.use(express.static(FRONTEND_DIST));

app.get("/{*any}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`wxbot-bind backend listening on http://localhost:${PORT}`);
});

