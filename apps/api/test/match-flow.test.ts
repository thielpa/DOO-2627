import { beforeEach, describe, expect, it } from "bun:test";
import type {
  AnswerResult,
  LobbyView,
  MatchSummary,
  MatchView,
  QuestionView,
  SearchResult,
  UseCases,
} from "../src/application";
import { type MatchEvent, OverdueMatch, QUESTIONS_PER_ROUND } from "../src/domain";
import { createApp } from "../src/http/app";
import { categories, questions } from "./support/fixtures";
import { type InMemoryMatchRepository, inMemoryUseCases } from "./support/in-memory-repositories";

const alice = "00000000-0000-4000-8000-00000000000a";
const bob = "00000000-0000-4000-8000-00000000000b";
const carol = "00000000-0000-4000-8000-00000000000c";

const TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

let app: ReturnType<typeof createApp>;
const sessionCookies = new Map<string, string>();
let useCases: UseCases;
let matches: InMemoryMatchRepository;
let events: MatchEvent[];
// Fake clock, so tests can let time pass.
let now: Date;
const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

beforeEach(() => {
  now = new Date("2026-01-01T00:00:00Z");
  sessionCookies.clear();
  ({ useCases, matches, events } = inMemoryUseCases(categories, questions, {
    now: () => now,
    turnTimeoutMs: TURN_TIMEOUT_MS,
  }));
  app = createApp({ useCases });
});

async function call(player: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost",
  };
  if (player) {
    let cookie = sessionCookies.get(player);
    if (!cookie) {
      const login = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ username: player, password: "test-password" }),
      });
      if (!login.ok) throw new Error(`test login failed: ${login.status}`);
      cookie = login.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) throw new Error("test login did not set a session cookie");
      sessionCookies.set(player, cookie);
    }
    headers.Cookie = cookie;
  }
  return app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(res: Response | Promise<Response>): Promise<T> {
  return (await res).json() as Promise<T>;
}

/** The id the server gave the test player when it logged in. */
async function idOf(player: string): Promise<string> {
  return (await json<{ id: string }>(call(player, "GET", "/auth/me"))).id;
}

async function startMatch(): Promise<string> {
  await call(alice, "POST", "/api/matchmaking/search");
  const result = await json<SearchResult>(call(bob, "POST", "/api/matchmaking/search"));
  if (result.status !== "matched") throw new Error("expected a match");
  return result.matchId;
}

/** Plays the current turn of `player`: picks a category if needed, then answers everything. */
async function playTurn(
  matchId: string,
  player: string,
  shouldAnswerCorrectly: boolean,
  askedQuestionIds: string[] = [],
) {
  let view = await json<MatchView>(call(player, "GET", `/api/matches/${matchId}`));
  if (view.current?.categories) {
    const res = await call(player, "POST", `/api/matches/${matchId}/category`, {
      categoryId: view.current.categories[0]?.id,
    });
    expect(res.status).toBe(204);
    view = await json<MatchView>(call(player, "GET", `/api/matches/${matchId}`));
  }
  while (view.isYourTurn && view.current?.hasQuestionToAnswer) {
    const question = await json<QuestionView>(
      call(player, "POST", `/api/matches/${matchId}/questions/next`),
    );
    askedQuestionIds.push(question.id);
    const optionId = question.options.find((o) =>
      o.id.endsWith(shouldAnswerCorrectly ? "-ok" : "-no"),
    )?.id;
    advance(1_000);
    const result = await json<AnswerResult>(
      call(player, "POST", `/api/matches/${matchId}/answers`, {
        questionId: question.id,
        optionId,
      }),
    );
    expect(result.isCorrect).toBe(shouldAnswerCorrectly);
    expect(result.correctOptionId).toBe(`${question.id}-ok`);
    view = await json<MatchView>(call(player, "GET", `/api/matches/${matchId}`));
  }
}

describe("matchmaking", () => {
  it("lets the first player wait and pairs the second one", async () => {
    const first = await json<SearchResult>(call(alice, "POST", "/api/matchmaking/search"));
    expect(first.status).toBe("searching");
    if (first.status !== "searching") return;

    // Searching again returns the same lobby instead of opening another one.
    const again = await json<SearchResult>(call(alice, "POST", "/api/matchmaking/search"));
    expect(again).toEqual(first);

    const second = await json<SearchResult>(call(bob, "POST", "/api/matchmaking/search"));
    expect(second.status).toBe("matched");
    if (second.status !== "matched") return;

    const lobby = await json<LobbyView>(
      call(alice, "GET", `/api/matchmaking/lobbies/${first.lobbyId}`),
    );
    expect(lobby).toEqual({ id: first.lobbyId, status: "STARTED", matchId: second.matchId });
  });

  it("requires a player id", async () => {
    expect((await call(null, "POST", "/api/matchmaking/search")).status).toBe(401);
  });
});

describe("match", () => {
  it("can be played to the end by both players", async () => {
    const matchId = await startMatch();
    const askedByAlice: string[] = [];

    // Round 1: alice chooses, round 2: bob chooses, round 3: alice chooses.
    for (const [chooser, opponent] of [
      [alice, bob],
      [bob, alice],
      [alice, bob],
    ] as const) {
      await playTurn(matchId, chooser, chooser === alice, chooser === alice ? askedByAlice : []);
      await playTurn(matchId, opponent, opponent === alice, opponent === alice ? askedByAlice : []);
    }

    // Every round always picks the same category, but no question is asked twice.
    const total = 3 * QUESTIONS_PER_ROUND;
    expect(askedByAlice).toHaveLength(total);
    expect(new Set(askedByAlice).size).toBe(total);

    const aliceView = await json<MatchView>(call(alice, "GET", `/api/matches/${matchId}`));
    const bobView = await json<MatchView>(call(bob, "GET", `/api/matches/${matchId}`));
    expect(aliceView).toMatchObject({ status: "COMPLETED", result: "WON", yourScore: total });
    expect(aliceView.opponentScore).toBe(0);
    expect(aliceView.turnDeadline).toBeNull();
    expect(bobView).toMatchObject({ status: "COMPLETED", result: "LOST", opponentScore: total });
    expect(aliceView.rounds.map((r) => r.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED"]);

    const list = await json<MatchView[]>(call(bob, "GET", "/api/matches"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: matchId, result: "LOST" });

    // The turn went back and forth: alice→bob (R1), bob→alice (R2), alice→bob (R3).
    expect(events.map((e) => e.type)).toEqual([
      "TurnPassed",
      "TurnPassed",
      "TurnPassed",
      "MatchCompleted",
    ]);
    expect(events.at(-1)).toMatchObject({ matchId, winnerId: await idOf(alice) });
  });

  it("shows the progress within the round", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });
    const progress = async () =>
      (await json<MatchView>(call(alice, "GET", `/api/matches/${matchId}`))).current;

    expect(await progress()).toMatchObject({
      answeredCount: 0,
      questionCount: QUESTIONS_PER_ROUND,
    });
    const question = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );
    await call(alice, "POST", `/api/matches/${matchId}/answers`, {
      questionId: question.id,
      optionId: null,
    });
    expect(await progress()).toMatchObject({ answeredCount: 1, hasQuestionToAnswer: true });
  });

  it("hides the opponent's round result until you finished the round", async () => {
    const matchId = await startMatch();
    await playTurn(matchId, alice, true);

    const bobView = await json<MatchView>(call(bob, "GET", `/api/matches/${matchId}`));
    expect(bobView.isYourTurn).toBe(true);
    expect(bobView.opponentScore).toBe(0);
    expect(bobView.rounds[0]?.opponentCorrectCount).toBeNull();
    expect(bobView.current?.hasQuestionToAnswer).toBe(true);
    expect(JSON.stringify(bobView)).not.toContain("food-");
  });

  it("does not reveal the question in the match view, only when it is shown", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });

    const view = await json<MatchView>(call(alice, "GET", `/api/matches/${matchId}`));
    expect(view.current?.hasQuestionToAnswer).toBe(true);
    expect(JSON.stringify(view)).not.toContain("food-");

    const question = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );
    expect(question).toMatchObject({ timeLimitMs: 20_000, remainingMs: 20_000 });
    expect(question.options[0]).not.toHaveProperty("isCorrect");

    // Showing it again (e.g. after a reload) keeps the clock running.
    advance(5_000);
    const again = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );
    expect(again).toMatchObject({ id: question.id, remainingMs: 15_000 });
  });

  it("measures the answer time on the server", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });
    const question = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );

    advance(60_000);
    const result = await json<AnswerResult>(
      call(alice, "POST", `/api/matches/${matchId}/answers`, {
        questionId: question.id,
        optionId: `${question.id}-ok`,
        // Ignored: clients cannot claim to have been faster.
        timeNeededMs: 0,
      }),
    );

    expect(result.isCorrect).toBe(false);
  });

  it("rejects an answer to a question that was not shown", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });

    const res = await call(alice, "POST", `/api/matches/${matchId}/answers`, {
      questionId: "food-1",
      optionId: "food-1-ok",
    });

    expect(res.status).toBe(409);
  });

  it("rejects a move when it is not your turn", async () => {
    const matchId = await startMatch();
    const res = await call(bob, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });

    expect(res.status).toBe(409);
  });

  it("rejects a category choice by others before looking at the category", async () => {
    const matchId = await startMatch();
    const res = await call(carol, "POST", `/api/matches/${matchId}/category`, {
      categoryId: "does-not-exist",
    });

    expect(res.status).toBe(403);
  });

  it("does not show a match to other players", async () => {
    const matchId = await startMatch();

    expect((await call(carol, "GET", `/api/matches/${matchId}`)).status).toBe(403);
  });

  it("counts a timeout without an option as wrong", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });
    const question = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );

    advance(20_000);
    const result = await json<AnswerResult>(
      call(alice, "POST", `/api/matches/${matchId}/answers`, {
        questionId: question.id,
        optionId: null,
      }),
    );

    expect(result.isCorrect).toBe(false);
  });

  it("validates the answer body", async () => {
    const matchId = await startMatch();
    const res = await call(alice, "POST", `/api/matches/${matchId}/answers`, { questionId: "x" });

    expect(res.status).toBe(400);
  });
});

describe("match expiry", () => {
  const summaryOf = async (player: string, matchId: string) =>
    (await json<MatchSummary[]>(call(player, "GET", "/api/matches"))).find((m) => m.id === matchId);

  it("tells the players until when the current turn has to be played", async () => {
    const matchId = await startMatch();
    const startedAt = now.getTime();

    const view = await json<MatchView>(call(bob, "GET", `/api/matches/${matchId}`));
    expect(view.turnDeadline).toBe(new Date(startedAt + TURN_TIMEOUT_MS).toISOString());

    advance(60_000);
    await playTurn(matchId, alice, true);
    const afterTurn = await json<MatchView>(call(bob, "GET", `/api/matches/${matchId}`));
    expect(new Date(afterTurn.turnDeadline ?? 0).getTime()).toBeGreaterThan(
      startedAt + TURN_TIMEOUT_MS,
    );
  });

  it("rejects moves after the deadline, even before the match is expired", async () => {
    const matchId = await startMatch();
    advance(TURN_TIMEOUT_MS);

    const res = await call(alice, "POST", `/api/matches/${matchId}/category`, {
      categoryId: "food",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The turn deadline has passed" });
  });

  it("lets the player who missed the deadline lose", async () => {
    const matchId = await startMatch();
    await playTurn(matchId, alice, false);
    advance(TURN_TIMEOUT_MS);

    expect(await useCases.expireOverdueMatches.execute()).toBe(1);

    expect(await summaryOf(alice, matchId)).toMatchObject({ status: "EXPIRED", result: "WON" });
    expect(await summaryOf(bob, matchId)).toMatchObject({
      status: "EXPIRED",
      result: "LOST",
      isYourTurn: false,
      turnDeadline: null,
    });
    expect(events.at(-1)).toMatchObject({
      type: "MatchExpired",
      missedByPlayerId: await idOf(bob),
      winnerId: await idOf(alice),
    });
  });

  it("expires mid-round, when the player stopped halfway through their questions", async () => {
    const matchId = await startMatch();
    await call(alice, "POST", `/api/matches/${matchId}/category`, { categoryId: "food" });
    const question = await json<QuestionView>(
      call(alice, "POST", `/api/matches/${matchId}/questions/next`),
    );
    await call(alice, "POST", `/api/matches/${matchId}/answers`, {
      questionId: question.id,
      optionId: `${question.id}-ok`,
    });
    advance(TURN_TIMEOUT_MS);

    await useCases.expireOverdueMatches.execute();

    // Alice played but did not finish her turn: she loses although she leads.
    expect(await summaryOf(alice, matchId)).toMatchObject({ result: "LOST", yourScore: 1 });
    const bobView = await json<MatchView>(call(bob, "GET", `/api/matches/${matchId}`));
    expect(bobView).toMatchObject({ result: "WON", opponentScore: 1, current: null });
  });

  it("has no winner when nobody played", async () => {
    const matchId = await startMatch();
    advance(TURN_TIMEOUT_MS);

    await useCases.expireOverdueMatches.execute();

    expect(await summaryOf(alice, matchId)).toMatchObject({ result: "NO_WINNER" });
    expect(await summaryOf(bob, matchId)).toMatchObject({ result: "NO_WINNER" });
    expect(events.at(-1)).toMatchObject({ type: "MatchExpired", winnerId: null });
  });

  it("does not expire a match whose player moved in time", async () => {
    const matchId = await startMatch();
    // playTurn takes one second per answer, so this ends shortly before the deadline.
    advance(TURN_TIMEOUT_MS - 10_000);
    await playTurn(matchId, alice, true);
    advance(10_000);

    expect(await useCases.expireOverdueMatches.execute()).toBe(0);
    expect(await summaryOf(bob, matchId)).toMatchObject({ status: "STARTED", isYourTurn: true });
  });

  it("does not expire a completed match", async () => {
    const matchId = await startMatch();
    for (const player of [alice, bob, bob, alice, alice, bob])
      await playTurn(matchId, player, true);
    // Well past any deadline, but within the session lifetime.
    advance(2 * TURN_TIMEOUT_MS);

    expect(await useCases.expireOverdueMatches.execute()).toBe(0);
    expect(await summaryOf(alice, matchId)).toMatchObject({ status: "COMPLETED", result: "DRAW" });
  });

  it("expires a match only once", async () => {
    await startMatch();
    advance(TURN_TIMEOUT_MS);

    expect(await useCases.expireOverdueMatches.execute()).toBe(1);
    advance(TURN_TIMEOUT_MS);
    expect(await useCases.expireOverdueMatches.execute()).toBe(0);
    expect(events.filter((e) => e.type === "MatchExpired")).toHaveLength(1);
  });

  it("only looks at overdue matches", async () => {
    const overdueId = await startMatch();
    advance(TURN_TIMEOUT_MS);
    await call(carol, "POST", "/api/matchmaking/search");
    const dave = "00000000-0000-4000-8000-00000000000d";
    await call(dave, "POST", "/api/matchmaking/search");

    expect(await matches.findIdsSatisfying(new OverdueMatch(now))).toEqual([overdueId]);
  });
});
