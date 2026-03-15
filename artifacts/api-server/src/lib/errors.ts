import { type Request, type Response, type NextFunction } from "express";
import { ValidationError } from "./validation";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Not found") {
  return new AppError(404, message);
}

export function badRequest(message: string) {
  return new AppError(400, message);
}

export function parseIntParam(value: string, paramName = "id"): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new AppError(400, `Invalid ${paramName}: must be a positive integer`);
  }
  return n;
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  const userId = req.user?.id || "anonymous";
  console.error(`[${req.method} ${req.path}] userId=${userId}`, err);

  res.status(500).json({ error: "Internal server error" });
}
