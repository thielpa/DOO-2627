import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { AcceptFriendChallenge } from "../../src/application/accept-friend-challenge";
import { DeclineFriendChallenge } from "../../src/application/decline-friend-challenge";
import { InviteFriend } from "../../src/application/invite-friend";
import type { FriendChallengeRepository, Match, MatchRepository } from "../../src/domain";
import { DEFAULT_TURN_TIMEOUT_MS, DomainError, FriendChallenge, Player } from "../../src/domain";
import { MikroOrmTransaction } from "../../src/infrastructure/persistence/mikro-orm-transaction";
import { MikroOrmFriendChallengeRepository } from "../../src/infrastructure/persistence/repositories/mikro-orm-friend-challenge.repository";
import { FriendChallengeSchema } from "../../src/infrastructure/persistence/schemas/friend-challenge.schema";
import { InMemoryPlayerRepository } from "../support/in-memory-repositories";
import { requireFriendChallengeTestDatabaseUrl } from "./friend-challenge-test-database";

const testDatabaseUrl = requireFriendChallengeTestDatabaseUrl(
  process.env.FRIEND_CHALLENGE_TEST_DATABASE_URL,
);
const schemaName = `friend_challenge_test_${crypto.randomUUID().replaceAll("-", "")}`;

describe("FriendChallenge PostgreSQL concurrency", () => {
  let orm: MikroORM;
  let players: InMemoryPlayerRepository;

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: testDatabaseUrl,
      schema: schemaName,
      entities: [FriendChallengeSchema],
      discovery: { warnWhenNoEntities: false },
    });
    const connection = orm.em.getConnection();
    await connection.execute(`create schema "${schemaName}"`);
    await connection.execute(
      `create table "${schemaName}"."friend_challenge" ("id" uuid primary key, "challenger_player_id" uuid not null, "challenged_player_id" uuid not null, "status" varchar(255) not null, "created_at" timestamptz not null, "responded_at" timestamptz null)`,
    );
    await connection.execute(
      `create unique index "friend_challenge_pending_unordered_pair_unique" on "${schemaName}"."friend_challenge" (least("challenger_player_id", "challenged_player_id"), greatest("challenger_player_id", "challenged_player_id")) where "status" = 'PENDING'`,
    );
    await connection.execute(
      `create table "${schemaName}"."test_match" ("id" uuid primary key, "test_run_id" uuid not null)`,
    );
    players = new InMemoryPlayerRepository();
  });

  afterAll(async () => {
    if (orm) {
      await orm.em.getConnection().execute(`drop schema "${schemaName}" cascade`);
      await orm.close(true);
    }
  });

  async function createPlayers() {
    const pairId = crypto.randomUUID();
    const challenger = Player.create(
      crypto.randomUUID(),
      `integration-alice-${pairId}`,
      "unused-hash",
    );
    const challenged = Player.create(
      crypto.randomUUID(),
      `integration-bob-${pairId}`,
      "unused-hash",
    );
    await players.save(challenger);
    await players.save(challenged);
    return { challenger, challenged };
  }

  async function seedChallenge(challenger: Player, challenged: Player): Promise<FriendChallenge> {
    const challenge = FriendChallenge.create(
      crypto.randomUUID(),
      challenger.id,
      challenged.id,
      new Date("2026-11-15T12:00:00Z"),
    );
    await new MikroOrmFriendChallengeRepository(requestEntityManager()).save(challenge);
    return challenge;
  }

  function requestEntityManager() {
    // Match the production request-scoped EM: repositories resolve the transactional fork
    // created by MikroOrmTransaction through MikroORM's async transaction context.
    return orm.em.fork({ useContext: true });
  }

  function matchRepository(
    em: ReturnType<typeof orm.em.fork>,
    testRunId: string,
    failAfterInsert = false,
  ): MatchRepository {
    return {
      byId: async () => null,
      byIdForUpdate: async () => null,
      forPlayer: async () => [],
      findIdsSatisfying: async () => [],
      save: async (match: Match) => {
        await em
          .getConnection()
          .execute(
            `insert into "${schemaName}"."test_match" ("id", "test_run_id") values (?, ?)`,
            [match.id, testRunId],
            "run",
            em.getTransactionContext(),
          );
        if (failAfterInsert) throw new Error("simulated match persistence failure");
      },
    };
  }

  function acceptUseCase(
    em: ReturnType<typeof orm.em.fork>,
    testRunId: string,
    failAfterInsert = false,
  ) {
    return new AcceptFriendChallenge(
      new MikroOrmFriendChallengeRepository(em),
      players,
      matchRepository(em, testRunId, failAfterInsert),
      new MikroOrmTransaction(em),
      () => new Date("2026-11-15T13:00:00Z"),
      DEFAULT_TURN_TIMEOUT_MS,
    );
  }

  async function matchCount(testRunId: string): Promise<number> {
    const rows = await orm.em
      .getConnection()
      .execute(
        `select count(*)::int as count from "${schemaName}"."test_match" where "test_run_id" = ?`,
        [testRunId],
      );
    const row = rows[0];
    if (!row) throw new Error("Expected match count result");
    return Number(row.count);
  }

  it("allows only one concurrent pending invitation for a Player pair", async () => {
    const { challenger, challenged } = await createPlayers();
    const makeInvite = () => {
      const em = requestEntityManager();
      return new InviteFriend(
        players,
        new MikroOrmFriendChallengeRepository(em),
        new MikroOrmTransaction(em),
        () => new Date(),
      );
    };
    const results = await Promise.allSettled([
      makeInvite().execute(challenger.id, challenged.username),
      makeInvite().execute(challenger.id, challenged.username),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.status === "rejected" && rejection.reason).toBeInstanceOf(DomainError);
    expect(rejection?.status === "rejected" && rejection.reason.code).toBe("CONFLICT");
  });

  it("allows only one concurrent pending invitation across opposite directions", async () => {
    const { challenger, challenged } = await createPlayers();
    const makeInvite = () => {
      const em = requestEntityManager();
      return new InviteFriend(
        players,
        new MikroOrmFriendChallengeRepository(em),
        new MikroOrmTransaction(em),
        () => new Date(),
      );
    };
    const results = await Promise.allSettled([
      makeInvite().execute(challenger.id, challenged.username),
      makeInvite().execute(challenged.id, challenger.username),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.status === "rejected" && rejection.reason).toBeInstanceOf(DomainError);
    expect(rejection?.status === "rejected" && rejection.reason.code).toBe("CONFLICT");
  });

  it("creates one Match when accept requests race", async () => {
    const { challenger, challenged } = await createPlayers();
    const challenge = await seedChallenge(challenger, challenged);
    const testRunId = crypto.randomUUID();
    const results = await Promise.allSettled([
      acceptUseCase(requestEntityManager(), testRunId).execute(challenge.id, challenged.id),
      acceptUseCase(requestEntityManager(), testRunId).execute(challenge.id, challenged.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await matchCount(testRunId)).toBe(1);
  });

  it("allows only one response when accept races with decline", async () => {
    const { challenger, challenged } = await createPlayers();
    const challenge = await seedChallenge(challenger, challenged);
    const testRunId = crypto.randomUUID();
    const accept = acceptUseCase(requestEntityManager(), testRunId);
    const declineEm = requestEntityManager();
    const decline = new DeclineFriendChallenge(
      new MikroOrmFriendChallengeRepository(declineEm),
      players,
      new MikroOrmTransaction(declineEm),
      () => new Date("2026-11-15T13:00:00Z"),
    );
    const results = await Promise.allSettled([
      accept.execute(challenge.id, challenged.id),
      decline.execute(challenge.id, challenged.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const stored = await new MikroOrmFriendChallengeRepository(requestEntityManager()).byId(
      challenge.id,
    );
    expect(["ACCEPTED", "DECLINED"]).toContain(stored ? stored.status : "MISSING");
    expect(await matchCount(testRunId)).toBe(stored?.status === "ACCEPTED" ? 1 : 0);
  });

  it("rolls back Match persistence when MatchRepository.save fails", async () => {
    const { challenger, challenged } = await createPlayers();
    const challenge = await seedChallenge(challenger, challenged);
    const testRunId = crypto.randomUUID();
    const em = requestEntityManager();
    await expect(
      acceptUseCase(em, testRunId, true).execute(challenge.id, challenged.id),
    ).rejects.toThrow("simulated match persistence failure");
    const stored = await new MikroOrmFriendChallengeRepository(requestEntityManager()).byId(
      challenge.id,
    );
    expect(stored?.status).toBe("PENDING");
    expect(await matchCount(testRunId)).toBe(0);
  });

  it("rolls back a Match if challenge persistence fails", async () => {
    const { challenger, challenged } = await createPlayers();
    const challenge = await seedChallenge(challenger, challenged);
    const testRunId = crypto.randomUUID();
    const em = requestEntityManager();
    const base = new MikroOrmFriendChallengeRepository(em);
    const repository: FriendChallengeRepository = {
      byId: (id) => base.byId(id),
      byIdForUpdate: (id) => base.byIdForUpdate(id),
      pendingBetween: (from, to) => base.pendingBetween(from, to),
      pendingForChallenged: (id) => base.pendingForChallenged(id),
      forChallenger: (id) => base.forChallenger(id),
      save: async () => {
        throw new Error("simulated challenge persistence failure");
      },
    };
    const useCase = new AcceptFriendChallenge(
      repository,
      players,
      matchRepository(em, testRunId),
      new MikroOrmTransaction(em),
      () => new Date("2026-11-15T13:00:00Z"),
      DEFAULT_TURN_TIMEOUT_MS,
    );
    await expect(useCase.execute(challenge.id, challenged.id)).rejects.toThrow(
      "simulated challenge persistence failure",
    );
    const stored = await new MikroOrmFriendChallengeRepository(requestEntityManager()).byId(
      challenge.id,
    );
    expect(stored?.status).toBe("PENDING");
    expect(await matchCount(testRunId)).toBe(0);
  });
});
