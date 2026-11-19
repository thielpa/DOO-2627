import { describe, expect, it } from "bun:test";
import type { MatchEvent, TurnPassed } from "../../src/domain";
import { InProcessEventDispatcher } from "../../src/infrastructure/events/in-process-event-dispatcher";

const turnPassed: TurnPassed = {
  eventId: "e1",
  type: "TurnPassed",
  version: 1,
  occurredAt: new Date("2026-01-01T00:00:00Z"),
  matchId: "m1",
  fromPlayerId: "alice",
  toPlayerId: "bob",
  roundNumber: 1,
  deadline: new Date("2026-01-02T00:00:00Z"),
};

describe("InProcessEventDispatcher", () => {
  it("calls the handlers of each event's type in subscription order, one after another", async () => {
    const dispatcher = new InProcessEventDispatcher<MatchEvent>();
    const calls: string[] = [];
    dispatcher.subscribe("TurnPassed", async (event) => {
      await Promise.resolve();
      calls.push(`first ${event.toPlayerId}`);
    });
    dispatcher.subscribe("TurnPassed", () => {
      calls.push("second");
    });
    dispatcher.subscribe("MatchExpired", () => {
      calls.push("not called");
    });

    await dispatcher.dispatch([turnPassed]);

    expect(calls).toEqual(["first bob", "second"]);
  });

  it("passes a failing handler's error on, so the transaction rolls back", async () => {
    const dispatcher = new InProcessEventDispatcher<MatchEvent>();
    dispatcher.subscribe("TurnPassed", () => {
      throw new Error("boom");
    });

    expect(dispatcher.dispatch([turnPassed])).rejects.toThrow("boom");
  });
});
