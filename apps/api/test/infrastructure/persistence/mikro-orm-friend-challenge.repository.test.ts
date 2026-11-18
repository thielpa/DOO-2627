import { describe, expect, it } from "bun:test";
import { LockMode, UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { DomainError, FriendChallenge } from "../../../src/domain";
import {
  MikroOrmFriendChallengeRepository,
  PENDING_FRIEND_CHALLENGE_UNIQUE_INDEX,
} from "../../../src/infrastructure/persistence/repositories/mikro-orm-friend-challenge.repository";
import { FriendChallengeSchema } from "../../../src/infrastructure/persistence/schemas/friend-challenge.schema";

describe("MikroOrmFriendChallengeRepository", () => {
  it("queries pending directions and saves a challenge", async () => {
    const challenge = FriendChallenge.create(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      new Date("2026-11-15T12:00:00Z"),
    );
    const queries: Record<string, unknown>[] = [];
    const persisted: FriendChallenge[] = [];
    const em = {
      findOne: async (_entity: unknown, where: Record<string, unknown>, options?: unknown) => {
        queries.push(options ? { where, options } : where);
        return challenge;
      },
      find: async (_entity: unknown, where: Record<string, unknown>, options: unknown) => {
        queries.push({ where, options });
        return [challenge];
      },
      persist: (entity: FriendChallenge) => ({
        flush: async () => {
          persisted.push(entity);
        },
      }),
    } as unknown as EntityManager;
    const repository = new MikroOrmFriendChallengeRepository(em);

    expect(await repository.byId(challenge.id)).toBe(challenge);
    expect(await repository.byIdForUpdate(challenge.id)).toBe(challenge);
    expect(
      await repository.pendingBetween(challenge.challengerPlayerId, challenge.challengedPlayerId),
    ).toBe(challenge);
    expect(await repository.pendingForChallenged(challenge.challengedPlayerId)).toEqual([
      challenge,
    ]);
    expect(await repository.forChallenger(challenge.challengerPlayerId)).toEqual([challenge]);
    await repository.save(challenge);

    expect(queries).toEqual([
      { _id: challenge.id },
      { where: { _id: challenge.id }, options: { lockMode: LockMode.PESSIMISTIC_WRITE } },
      {
        $or: [
          {
            _challengerPlayerId: challenge.challengerPlayerId,
            _challengedPlayerId: challenge.challengedPlayerId,
          },
          {
            _challengerPlayerId: challenge.challengedPlayerId,
            _challengedPlayerId: challenge.challengerPlayerId,
          },
        ],
        _status: "PENDING",
      },
      {
        where: { _challengedPlayerId: challenge.challengedPlayerId, _status: "PENDING" },
        options: { orderBy: { _createdAt: "asc" } },
      },
      {
        where: { _challengerPlayerId: challenge.challengerPlayerId },
        options: { orderBy: { _createdAt: "desc" } },
      },
    ]);
    expect(persisted).toEqual([challenge]);
  });

  it("maps only the pending-pair unique-index violation to CONFLICT", async () => {
    const challenge = FriendChallenge.create(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      new Date("2026-11-15T12:00:00Z"),
    );
    const uniqueError = new UniqueConstraintViolationException(
      Object.assign(new Error("duplicate key"), {
        constraint: PENDING_FRIEND_CHALLENGE_UNIQUE_INDEX,
      }),
    );
    const em = {
      persist: () => ({
        flush: async () => {
          throw uniqueError;
        },
      }),
    } as unknown as EntityManager;
    const repository = new MikroOrmFriendChallengeRepository(em);

    await expect(repository.save(challenge)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A pending challenge already exists",
    });
  });

  it("propagates unrelated unique and persistence failures unchanged", async () => {
    const challenge = FriendChallenge.create(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      new Date("2026-11-15T12:00:00Z"),
    );
    const failures = [
      new UniqueConstraintViolationException(
        Object.assign(new Error("different constraint"), { constraint: "friend_challenge_pkey" }),
      ),
      new Error("database unavailable"),
    ];

    for (const failure of failures) {
      const em = {
        persist: () => ({
          flush: async () => {
            throw failure;
          },
        }),
      } as unknown as EntityManager;
      const repository = new MikroOrmFriendChallengeRepository(em);

      try {
        await repository.save(challenge);
        throw new Error("Expected save to fail");
      } catch (error) {
        expect(error).toBe(failure);
        expect(error).not.toBeInstanceOf(DomainError);
      }
    }
  });
});

describe("FriendChallenge persistence schema", () => {
  it("maps challenge state and both invitation-list indexes", () => {
    const properties = FriendChallengeSchema.meta.properties as unknown as Record<
      string,
      { fieldName?: string; nullable?: boolean }
    >;
    const indexes = FriendChallengeSchema.meta.indexes as Array<{
      name?: string;
      properties?: string[];
    }>;
    const uniques = FriendChallengeSchema.meta.uniques as Array<{
      name?: string;
      properties?: string[];
      where?: Record<string, unknown>;
      expression?: string;
    }>;

    expect(FriendChallengeSchema.meta.tableName).toBe("friend_challenge");
    expect(properties._id?.fieldName).toBe("id");
    expect(properties._challengerPlayerId?.fieldName).toBe("challenger_player_id");
    expect(properties._challengedPlayerId?.fieldName).toBe("challenged_player_id");
    expect(properties._status?.fieldName).toBe("status");
    expect(properties._createdAt?.fieldName).toBe("created_at");
    expect(properties._respondedAt?.fieldName).toBe("responded_at");
    expect(properties._respondedAt?.nullable).toBe(true);
    expect(indexes).toEqual([
      {
        name: "friend_challenge_incoming_status_index",
        properties: ["_challengedPlayerId", "_status"],
      },
      {
        name: "friend_challenge_outgoing_created_index",
        properties: ["_challengerPlayerId", "_createdAt"],
      },
    ]);
    expect(uniques).toEqual([
      {
        name: PENDING_FRIEND_CHALLENGE_UNIQUE_INDEX,
        expression:
          'create unique index "friend_challenge_pending_unordered_pair_unique" on "friend_challenge" (least("challenger_player_id", "challenged_player_id"), greatest("challenger_player_id", "challenged_player_id")) where "status" = \'PENDING\'',
      },
    ]);
  });
});
