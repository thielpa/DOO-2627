import { describe, expect, it } from "bun:test";
import { DomainError, Player } from "../../src/domain";
import { AcceptFriendChallenge } from "../../src/application/accept-friend-challenge";
import { DeclineFriendChallenge } from "../../src/application/decline-friend-challenge";
import { InviteFriend } from "../../src/application/invite-friend";
import { ListFriendChallenges } from "../../src/application/list-friend-challenges";
import {
  InMemoryFriendChallengeRepository,
  InMemoryMatchRepository,
  InMemoryPlayerRepository,
} from "../support/in-memory-repositories";

const challenger = Player.create("00000000-0000-4000-8000-000000000001", "alice", "hash-a");
const challenged = Player.create("00000000-0000-4000-8000-000000000002", "bob", "hash-b");
const carol = Player.create("00000000-0000-4000-8000-000000000003", "carol", "hash-c");

function setup() {
  let now = new Date("2026-11-15T12:00:00Z");
  const players = new InMemoryPlayerRepository();
  const challenges = new InMemoryFriendChallengeRepository();
  const matches = new InMemoryMatchRepository();
  const transaction = { run: <T>(work: () => Promise<T>) => work() };
  const invite = new InviteFriend(players, challenges, transaction, () => now);
  const list = new ListFriendChallenges(challenges, players);
  const accept = new AcceptFriendChallenge(challenges, players, matches, transaction, () => now);
  const decline = new DeclineFriendChallenge(challenges, players, transaction, () => now);

  return {
    players,
    challenges,
    matches,
    invite,
    list,
    accept,
    decline,
    setNow: (value: Date) => { now = value; },
  };
}

async function seedPlayers(players: InMemoryPlayerRepository) {
  await players.save(challenger);
  await players.save(challenged);
  await players.save(carol);
}

describe("friend challenge use cases", () => {
  it("invites a Player by exact username", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);

    const result = await ctx.invite.execute(challenger.id, "bob");

    expect(result).toMatchObject({
      challengerPlayerId: challenger.id,
      challengerUsername: "alice",
      challengedPlayerId: challenged.id,
      challengedUsername: "bob",
      status: "PENDING",
      respondedAt: null,
    });
  });

  it("rejects unknown usernames and self-invitations", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);

    await expect(ctx.invite.execute(challenger.id, "nobody")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ctx.invite.execute(challenger.id, "alice")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists incoming pending challenges and outgoing challenges", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);
    await ctx.invite.execute(challenger.id, "bob");
    await ctx.invite.execute(carol.id, "bob");

    const bobLists = await ctx.list.execute(challenged.id);
    const aliceLists = await ctx.list.execute(challenger.id);

    expect(bobLists.incoming).toHaveLength(2);
    expect(bobLists.incoming.map((challenge) => challenge.challengerUsername)).toEqual([
      "alice",
      "carol",
    ]);
    expect(bobLists.outgoing).toHaveLength(0);
    expect(aliceLists.outgoing).toHaveLength(1);
    expect(aliceLists.outgoing[0]?.challengedUsername).toBe("bob");
  });

  it("rejects duplicate pending invitations but permits a new invitation after resolution", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);
    const pending = await ctx.invite.execute(challenger.id, "bob");

    await expect(ctx.invite.execute(challenger.id, "bob")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await ctx.decline.execute(pending.id, challenged.id);

    expect((await ctx.invite.execute(challenger.id, "bob")).status).toBe("PENDING");
  });

  it("accepts only by the challenged Player and starts a SOLO_FRIEND Match", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);
    const pending = await ctx.invite.execute(challenger.id, "bob");

    await expect(ctx.accept.execute(pending.id, carol.id)).rejects.toMatchObject({
      code: "NOT_ALLOWED",
    });
    const accepted = await ctx.accept.execute(pending.id, challenged.id);
    const matches = await ctx.matches.forPlayer(challenger.id);

    expect(accepted.challenge.status).toBe("ACCEPTED");
    expect(accepted.challenge.respondedAt).not.toBeNull();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: accepted.matchId,
      mode: "SOLO_FRIEND",
      status: "STARTED",
      players: [challenger.id, challenged.id],
    });
  });

  it("declines only by the challenged Player and prevents responding twice", async () => {
    const ctx = setup();
    await seedPlayers(ctx.players);
    const pending = await ctx.invite.execute(challenger.id, "bob");

    await expect(ctx.decline.execute(pending.id, challenger.id)).rejects.toMatchObject({
      code: "NOT_ALLOWED",
    });
    const declined = await ctx.decline.execute(pending.id, challenged.id);

    expect(declined.status).toBe("DECLINED");
    expect(declined.respondedAt).not.toBeNull();
    await expect(ctx.accept.execute(pending.id, challenged.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(ctx.decline.execute(pending.id, challenged.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
