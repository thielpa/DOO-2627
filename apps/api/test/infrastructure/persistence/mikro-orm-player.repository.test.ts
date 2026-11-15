import { describe, expect, it } from "bun:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Player } from "../../../src/domain";
import { MikroOrmPlayerRepository } from "../../../src/infrastructure/persistence/repositories/mikro-orm-player.repository";
import { PlayerSchema } from "../../../src/infrastructure/persistence/schemas/player.schema";

function makeRepository(seed: Player[] = []) {
  const players = new Map(seed.map((player) => [player.id, player]));
  let persisted: Player | null = null;
  let flushed = false;

  const em = {
    findOne: async (_entity: unknown, where: Record<string, unknown>) => {
      if ("_id" in where) return players.get(String(where._id)) ?? null;
      if ("_username" in where) {
        return [...players.values()].find((player) => player.username === where._username) ?? null;
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

  it("finds a player by username", async () => {
    const player = Player.create("00000000-0000-4000-8000-000000000001", "alice", "argon-hash");
    const { repository } = makeRepository([player]);

    expect(await repository.byUsername("alice")).toBe(player);
  });

  it("returns null when no player matches", async () => {
    const { repository } = makeRepository();

    expect(await repository.byId("missing")).toBeNull();
    expect(await repository.byUsername("missing")).toBeNull();
  });
});

describe("Player persistence schema", () => {
  it("maps the credential hash and enforces username uniqueness", () => {
    const properties = PlayerSchema.meta.properties as unknown as Record<
      string,
      { fieldName?: string; unique?: boolean }
    >;

    expect(PlayerSchema.meta.tableName).toBe("player");
    expect(properties._id?.fieldName).toBe("id");
    expect(properties._username?.fieldName).toBe("username");
    expect(properties._username?.unique).toBe(true);
    expect(properties._passwordHash?.fieldName).toBe("password_hash");
  });
});
