import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { UseCases } from "../application";
import type { SessionAuthEnv } from "./player-id";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export function requireSession(useCases: Pick<UseCases, "validateSession">) {
  return createMiddleware<SessionAuthEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!token) throw new HTTPException(401, { message: "Authentication required" });

    const session = await useCases.validateSession.execute(token);
    if (!session) throw new HTTPException(401, { message: "Authentication required" });

    c.set("playerId", session.playerId);
    await next();
  });
}
