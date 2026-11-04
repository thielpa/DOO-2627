import { RequestContext } from "@mikro-orm/core";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

export interface AppDependencies {
  orm?: MikroORM;
}

export function createApp({ orm }: AppDependencies = {}) {
  const app = new Hono();

  if (orm) {
    // Every request gets its own EntityManager fork (Unit of Work / Identity Map).
    app.use((_c, next) => RequestContext.create(orm.em, next));
  }

  return app.route("/api/health", healthRoutes);
}

export type AppType = ReturnType<typeof createApp>;
