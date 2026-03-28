import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { errorHandler } from "./lib/errors";
import router from "./routes";

const app: Express = express();

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const allowedOrigins: string[] = [];
const configuredOrigins = process.env.ALLOWED_ORIGINS;
if (configuredOrigins) {
  for (const o of configuredOrigins.split(",")) {
    const trimmed = o.trim();
    if (trimmed) allowedOrigins.push(trimmed);
  }
}

app.use(cors({
  credentials: true,
  origin(incoming, callback) {
    const isLocalhost = process.env.NODE_ENV !== "production" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(incoming ?? "");
    if (
      !incoming ||
      allowedOrigins.includes(incoming) ||
      isLocalhost
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"));
    }
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

app.use(errorHandler);

// Serve PWA static build (after API routes so /api/* takes priority)
const webRoot = path.resolve(__dirname, "../../mobile/dist/web");

// Service worker must not be aggressively cached
app.get("/sw.js", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(webRoot, "sw.js"));
});

// Static assets with long-term caching (hashed filenames)
app.use(express.static(webRoot, {
  maxAge: "1y",
  immutable: true,
  index: false,
}));

// SPA fallback — non-API, non-static routes serve index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

export default app;
