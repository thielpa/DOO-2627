import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Placeholder identity until Account/Profile exists
export function playerIdOf(c: Context): string {
  const playerId = c.req.header("X-Player-Id");
  if (!playerId || !UUID_PATTERN.test(playerId)) {
    throw new HTTPException(401, { message: "Missing or invalid X-Player-Id header" });
  }
  return playerId.toLowerCase();
}
