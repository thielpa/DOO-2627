import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import type { UseCases } from "../../application";
import { playerIdOf, type SessionAuthEnv } from "../player-id";
import { requireSession } from "../session-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inviteBody = validator("json", (body: { username?: unknown }) => {
  if (typeof body?.username !== "string" || body.username.length === 0) {
    throw new HTTPException(400, { message: "username is required" });
  }
  return { username: body.username };
});

function challengeIdOf(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new HTTPException(400, { message: "Invalid challenge ID" });
  return id;
}

export const friendChallengeRoutes = (useCases: UseCases) =>
  new Hono<SessionAuthEnv>()
    .use("*", requireSession(useCases))
    .post("/", inviteBody, async (c) => {
      const { username } = c.req.valid("json");
      return c.json(await useCases.inviteFriend.execute(playerIdOf(c), username), 201);
    })
    .get("/", async (c) => c.json(await useCases.listFriendChallenges.execute(playerIdOf(c))))
    .post("/:id/accept", async (c) =>
      c.json(
        await useCases.acceptFriendChallenge.execute(
          challengeIdOf(c.req.param("id")),
          playerIdOf(c),
        ),
      ),
    )
    .post("/:id/decline", async (c) =>
      c.json(
        await useCases.declineFriendChallenge.execute(
          challengeIdOf(c.req.param("id")),
          playerIdOf(c),
        ),
      ),
    );
