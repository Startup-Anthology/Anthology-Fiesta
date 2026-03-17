import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { errorHandler } from "./lib/errors";
import router from "./routes";

const app: Express = express();

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
