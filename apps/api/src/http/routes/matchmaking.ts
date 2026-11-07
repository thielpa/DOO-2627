import { Hono } from "hono";
import type { UseCases } from "../../application";
import { playerIdOf } from "../player-id";

export const matchmakingRoutes = (useCases: UseCases) =>
  new Hono()
    .post("/search", async (c) =>
      c.json(await useCases.searchRandomOpponent.execute(playerIdOf(c))),
    )
    .get("/lobbies/:id", async (c) =>
      c.json(await useCases.getLobby.execute(c.req.param("id"), playerIdOf(c))),
    );
