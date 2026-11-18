import { describe, expect, it } from "bun:test";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Player } from "../../../src/domain";
import {
  MikroOrmPlayerRepository,
  PLAYER_USERNAME_UNIQUE_INDEX,
} from "../../../src/infrastructure/persistence/repositories/mikro-orm-player.repository";
import { PlayerSchema } from "../../../src/infrastructure/persistence/schemas/player.schema";

function makeRepository(seed: Player[] = []) {
  const players = new Map(seed.map((player) => [player.id, player]));
  let persisted: Player | null = null;
  let flushed = false;

  const em = {
    findOne: async (_entity: unknown, where: Record<string, unknown>) => {
      if ("_id" in where) return players.get(String(where._id)) ?? null;
      if (Object.getOwnPropertySymbols(where).length > 0) {
        return (
          [...players.values()].find(
            (player) => player.username.toLowerCase() === "alice".toLowerCase(),
          ) ?? null
        );
      }
      return null;
    },
    persist: (player: Player) => ({
      flush: async () => {
        persisted = player;
        flushed = true;
        players.set(player.id, player);
      },
    }),
  } as unknown as EntityManager;

  return {
    repository: new MikroOrmPlayerRepository(em),
    persisted: () => persisted,
    flushed: () => flushed,
  };
}

describe("MikroOrmPlayerRepository", () => {
  it("persists a player and flushes the EntityManager", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "alice", "argon-hash");
    const { repository, persisted, flushed } = makeRepository();

    await repository.save(player);

    expect(persisted()).toBe(player);
    expect(flushed()).toBe(true);
  });

  it("finds a player by ID and preserves the password hash", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "alice", "argon-hash");
    const { repository } = makeRepository([player]);

    const found = await repository.byId(player.id);

    expect(found).toBe(player);
    expect(found?.passwordHash).toBe("argon-hash");
  });

  it("finds a player by username without regard to case", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "alice", "argon-hash");
    const { repository } = makeRepository([player]);

    expect(await repository.byUsername("ALICE")).toBe(player);
  });

  it("returns null when no player matches", async () => {
    const { repository } = makeRepository();

    expect(await repository.byId("missing")).toBeNull();
    expect(await repository.byUsername("missing")).toBeNull();
  });

  it("maps only the case-insensitive username index violation to CONFLICT", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "Alice", "argon-hash");
    const uniqueError = new UniqueConstraintViolationException(
      Object.assign(new Error("duplicate key"), { constraint: PLAYER_USERNAME_UNIQUE_INDEX }),
    );
    const em = {
      persist: () => ({ flush: async () => Promise.reject(uniqueError) }),
    } as unknown as EntityManager;

    await expect(new MikroOrmPlayerRepository(em).save(player)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A Player with this username already exists",
    });
  });

  it("propagates unrelated persistence errors unchanged", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "Alice", "argon-hash");
    const failure = new Error("database unavailable");
    const em = {
      persist: () => ({ flush: async () => Promise.reject(failure) }),
    } as unknown as EntityManager;

    await expect(new MikroOrmPlayerRepository(em).save(player)).rejects.toBe(failure);
  });
});

describe("Player persistence schema", () => {
  it("maps the credential hash and defines case-insensitive username uniqueness", () => {
    const properties = PlayerSchema.meta.properties as unknown as Record<
      string,
      { fieldName?: string; unique?: boolean }
    >;

    expect(PlayerSchema.meta.tableName).toBe("player");
    expect(properties._id?.fieldName).toBe("id");
    expect(properties._username?.fieldName).toBe("username");
    expect(properties._username?.unique).not.toBe(true);
    expect(PlayerSchema.meta.uniques).toContainEqual(
      expect.objectContaining({ name: "player_username_lower_unique" }),
    );
    expect(properties._passwordHash?.fieldName).toBe("password_hash");
  });
});
