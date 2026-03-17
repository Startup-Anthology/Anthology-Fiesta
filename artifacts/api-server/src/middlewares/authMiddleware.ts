import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  getSessionId,
  getSession,
  type SessionUser,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends SessionUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const [dbUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      role: usersTable.role,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, session.user.id));

  if (!dbUser || !dbUser.isActive) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    role: dbUser.role,
  };
  next();
}
