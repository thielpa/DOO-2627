import type { MikroORM } from "@mikro-orm/postgresql";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { UseCases } from "../application";
import { AuthenticationError } from "../application";
import { DomainError, type DomainErrorCode } from "../domain";
import type { SessionAuthEnv } from "./player-id";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { friendChallengeRoutes } from "./routes/friend-challenges";
import { healthRoutes } from "./routes/health";
import { matchRoutes } from "./routes/matches";
import { matchmakingRoutes } from "./routes/matchmaking";
import { notificationRoutes } from "./routes/notifications";
import { requireSameOriginForUnsafeMethods } from "./same-origin-unsafe";

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
  const app = new Hono<SessionAuthEnv>();

  if (aroundRequest) {
    app.use((_c, next) => aroundRequest(next));
  }

  app.use("*", csrf());
  app.use("*", requireSameOriginForUnsafeMethods);

  app.onError((err, c) => {
    if (err instanceof AuthenticationError) {
      return c.json({ error: "Invalid username or password" }, 401);
    }
    if (err instanceof DomainError) return c.json({ error: err.message }, statusOf[err.code]);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app
    .route("/auth", authRoutes(useCases))
    .route("/api/health", healthRoutes(orm))
    .route("/api/matchmaking", matchmakingRoutes(useCases))
    .route("/api/categories", categoryRoutes(useCases))
    .route("/api/matches", matchRoutes(useCases))
    .route("/api/friend-challenges", friendChallengeRoutes(useCases))
    .route("/api/notifications", notificationRoutes(useCases));
}

export type AppType = ReturnType<typeof createApp>;
