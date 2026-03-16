import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { errorHandler } from "./lib/errors";
import router from "./routes";

const app: Express = express();

const allowedOrigins: string[] = [];
const replitDomains = process.env.REPLIT_DOMAINS;
if (replitDomains) {
  for (const d of replitDomains.split(",")) {
    const trimmed = d.trim();
    if (trimmed) allowedOrigins.push(`https://${trimmed}`);
  }
}
const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
if (expoDomain) allowedOrigins.push(`https://${expoDomain}`);

app.use(cors({
  credentials: true,
  origin(incoming, callback) {
    if (
      !incoming ||
      allowedOrigins.includes(incoming) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(incoming)
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"));
    }
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

app.use(errorHandler);

export default app;
