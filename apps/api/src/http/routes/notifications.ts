import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { InvalidNotificationQuery, type UseCases } from "../../application";
import { playerIdOf, type SessionAuthEnv } from "../player-id";
import { requireSession } from "../session-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new HTTPException(400, { message: "Invalid limit" });
  return Number(value);
}

export const notificationRoutes = (useCases: UseCases) =>
  new Hono<SessionAuthEnv>()
    .use("*", requireSession(useCases))
    .get("/", async (c) => {
      const result = await useCases.listNotifications
        .execute({
          playerId: playerIdOf(c),
          since: c.req.query("since"),
          limit: limitOf(c.req.query("limit")),
          ifNoneMatch: c.req.header("If-None-Match"),
        })
        .catch((error: unknown) => {
          if (error instanceof InvalidNotificationQuery) {
            throw new HTTPException(400, { message: error.message });
          }
          throw error;
        });
      c.header("ETag", result.etag);
      c.header("Cache-Control", "private, no-cache");
      if (result.notModified) return c.body(null, 304);
      return c.json({
        items: result.items,
        unreadCount: result.unreadCount,
        cursor: result.cursor,
      });
    })
    .post("/:id/read", async (c) => {
      const id = c.req.param("id");
      if (!UUID_PATTERN.test(id))
        throw new HTTPException(400, { message: "Invalid notification ID" });
      await useCases.markNotificationRead.execute(id, playerIdOf(c));
      return c.body(null, 204);
    });
