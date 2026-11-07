import type { MikroORM } from "@mikro-orm/postgresql";
import { Hono } from "hono";

// Without an ORM (e.g. in tests) only the HTTP layer is checked.
export function healthRoutes(orm?: MikroORM) {
  return new Hono().get("/", async (c) => {
    try {
      // A real query: MikroORM 7 connects lazily, so isConnected() is false until first use.
      await orm?.em.getConnection().execute("select 1");
      return c.json({ status: "ok" as const }, 200);
    } catch {
      return c.json({ status: "db-unavailable" as const }, 503);
    }
  });
}
