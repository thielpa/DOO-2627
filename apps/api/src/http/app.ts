import type { MikroORM } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { UseCases } from "../application";
import { DomainError, type DomainErrorCode } from "../domain";
import { categoryRoutes } from "./routes/categories";
import { healthRoutes } from "./routes/health";
import { matchRoutes } from "./routes/matches";
import { matchmakingRoutes } from "./routes/matchmaking";

/** Wraps the handling of one request, e.g. to give it its own persistence context. */
export type AroundRequest = (next: () => Promise<void>) => Promise<void>;

export interface AppDependencies {
  useCases: UseCases;
  aroundRequest?: AroundRequest;
  /** Used by the health check to verify the database connection. */
  orm?: MikroORM;
}

const statusOf: Record<DomainErrorCode, 403 | 404 | 409> = {
  NOT_FOUND: 404,
  NOT_ALLOWED: 403,
  CONFLICT: 409,
};

export function createApp({ useCases, aroundRequest, orm }: AppDependencies) {
  const app = new Hono();

  if (aroundRequest) {
    app.use((_c, next) => aroundRequest(next));
  }

  app.onError((err, c) => {
    if (err instanceof DomainError) return c.json({ error: err.message }, statusOf[err.code]);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app
    .route("/api/health", healthRoutes(orm))
    .route("/api/matchmaking", matchmakingRoutes(useCases))
    .route("/api/categories", categoryRoutes(useCases))
    .route("/api/matches", matchRoutes(useCases));
}

export type AppType = ReturnType<typeof createApp>;
