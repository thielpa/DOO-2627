import { describe, expect, it } from "bun:test";
import { ExpireOverdueMatches } from "../../src/application/expire-overdue-matches";
import { Match, type MatchEvent } from "../../src/domain";
import { InProcessEventDispatcher } from "../../src/infrastructure/events/in-process-event-dispatcher";
import { InMemoryMatchRepository } from "../support/in-memory-repositories";

const start = new Date("2026-01-01T00:00:00Z");
const later = new Date("2026-01-03T00:00:00Z");

async function startedMatch(matches: InMemoryMatchRepository, id: string) {
  const match = Match.create(id, ["alice", "bob"], "SOLO_RANDOM", "EASY");
  match.start(start);
  await matches.save(match);
}

describe("ExpireOverdueMatches", () => {
  it("dispatches MatchExpired inside the transaction, after saving", async () => {
    const matches = new InMemoryMatchRepository();
    await startedMatch(matches, "m1");
    const steps: string[] = [];
    const events = new InProcessEventDispatcher<MatchEvent>();
    events.subscribe("MatchExpired", async (event) => {
      const saved = await matches.byId(event.matchId);
      steps.push(`handler sees ${saved?.status}`);
    });
    const transaction = {
      run: async <T>(work: () => Promise<T>) => {
        steps.push("begin");
        const result = await work();
        steps.push("commit");
        return result;
      },
    };

    await new ExpireOverdueMatches(matches, transaction, events, () => later).execute();

    expect(steps).toEqual(["begin", "handler sees EXPIRED", "commit"]);
  });

  it("expires the other matches when one fails, then reports the failure", async () => {
    const matches = new InMemoryMatchRepository();
    await startedMatch(matches, "m1");
    await startedMatch(matches, "m2");
    const events = new InProcessEventDispatcher<MatchEvent>();
    events.subscribe("MatchExpired", (event) => {
      if (event.matchId === "m1") throw new Error("handler failed");
    });
    const useCase = new ExpireOverdueMatches(
      matches,
      { run: (work) => work() },
      events,
      () => later,
    );

    expect(useCase.execute()).rejects.toThrow("1 overdue match(es) could not be expired");
    expect((await matches.byId("m2"))?.status).toBe("EXPIRED");
  });
});
