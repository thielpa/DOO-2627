import { getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import type { UseCases } from "../../application";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../session-cookie";

const loginBody = validator("json", (body: { username?: unknown; password?: unknown }) => {
  if (
    typeof body?.username !== "string" ||
    body.username.length === 0 ||
    typeof body.password !== "string" ||
    body.password.length === 0
  ) {
    throw new HTTPException(400, { message: "username and password are required" });
  }
  return { username: body.username, password: body.password };
});

export const authRoutes = (useCases: UseCases) =>
  new Hono()
    .post("/login", loginBody, async (c) => {
      const credentials = c.req.valid("json");
      const player = await useCases.authenticatePlayer.execute(credentials);
      const session = await useCases.createSession.execute(player.id);
      setCookie(c, SESSION_COOKIE_NAME, session.token, sessionCookieOptions(c.req.url));
      return c.json({ id: player.id, username: player.username });
    })
    .post("/logout", async (c) => {
      const token = getCookie(c, SESSION_COOKIE_NAME);
      try {
        if (token) await useCases.invalidateSession.execute(token);
      } finally {
        setCookie(c, SESSION_COOKIE_NAME, "", {
          ...sessionCookieOptions(c.req.url),
          maxAge: 0,
        });
      }
      return c.body(null, 204);
    });
