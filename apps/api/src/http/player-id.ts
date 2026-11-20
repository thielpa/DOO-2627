import type { Context, Env } from "hono";

export interface SessionAuthEnv extends Env {
  Variables: {
    playerId: string;
  };
}

/** Reads the identity established by session middleware, never a client-supplied ID. */
export function playerIdOf(c: Context<SessionAuthEnv>): string {
  return c.get("playerId");
}
