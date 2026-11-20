import { Hono } from "hono";
import type { UseCases } from "../../application";
import { playerIdOf, type SessionAuthEnv } from "../player-id";
import { requireSession } from "../session-auth";

export const matchmakingRoutes = (useCases: UseCases) =>
  new Hono<SessionAuthEnv>()
    .use("*", requireSession(useCases))
    .post("/search", async (c) =>
      c.json(await useCases.searchRandomOpponent.execute(playerIdOf(c))),
    )
    .get("/lobbies/:id", async (c) =>
      c.json(await useCases.getLobby.execute(c.req.param("id"), playerIdOf(c))),
    );
