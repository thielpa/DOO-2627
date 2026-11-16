import { describe, expect, it } from "bun:test";
import { AuthenticatePlayer, AuthenticationError } from "../../src/application/authenticate-player";
import type { PasswordHasher } from "../../src/application/password-hasher";
import { Player } from "../../src/domain";
import { InMemoryPlayerRepository } from "../support/in-memory-repositories";

function fakeHasher(
  options: {
    hash?: (plaintext: string) => Promise<string>;
    verify?: (plaintext: string, hash: string) => Promise<boolean>;
  } = {},
) {
  const hashed: string[] = [];
  const verified: Array<{ plaintext: string; hash: string }> = [];
  const hasher: PasswordHasher = {
    hash: async (plaintext) => {
      hashed.push(plaintext);
      return options.hash ? options.hash(plaintext) : `argon:${plaintext}`;
    },
    verify: async (plaintext, hash) => {
      verified.push({ plaintext, hash });
      return options.verify ? options.verify(plaintext, hash) : hash === `argon:${plaintext}`;
    },
  };
  return { hasher, hashed, verified };
}

describe("AuthenticatePlayer", () => {
  it("creates and saves a Player on first login without persisting plaintext", async () => {
    const players = new InMemoryPlayerRepository();
    const { hasher, hashed } = fakeHasher();
    const authenticate = new AuthenticatePlayer(players, hasher);

    const result = await authenticate.execute({ username: "alice", password: "secret" });
    const saved = await players.byUsername("alice");

    expect(result).toEqual({ id: expect.any(String), username: "alice" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(saved?.passwordHash).toBe("argon:secret");
    expect(saved?.passwordHash).not.toBe("secret");
    expect(hashed).toEqual(["secret"]);
  });

  it("authenticates an existing Player with the correct password without hashing", async () => {
    const players = new InMemoryPlayerRepository();
    const player = Player.create("player-1", "alice", "argon:secret");
    await players.save(player);
    const { hasher, hashed, verified } = fakeHasher();
    const authenticate = new AuthenticatePlayer(players, hasher);

    const result = await authenticate.execute({ username: "alice", password: "secret" });

    expect(result).toEqual({ id: "player-1", username: "alice" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(hashed).toEqual([]);
    expect(verified).toEqual([{ plaintext: "secret", hash: "argon:secret" }]);
  });

  it("rejects an incorrect password with a generic authentication error", async () => {
    const players = new InMemoryPlayerRepository();
    await players.save(Player.create("player-1", "alice", "argon:secret"));
    const { hasher } = fakeHasher();
    const authenticate = new AuthenticatePlayer(players, hasher);

    const error = await authenticate
      .execute({ username: "alice", password: "wrong" })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toMatchObject({ message: "Invalid username or password" });
  });

  it("propagates repository lookup errors", async () => {
    const failure = new Error("repository unavailable");
    const players = {
      byUsername: async () => {
        throw failure;
      },
      byId: async () => null,
      save: async () => {},
    };
    const { hasher } = fakeHasher();

    await expect(
      new AuthenticatePlayer(players, hasher).execute({ username: "alice", password: "secret" }),
    ).rejects.toBe(failure);
  });

  it("propagates repository save errors", async () => {
    const failure = new Error("database unavailable");
    const players = {
      byUsername: async () => null,
      byId: async () => null,
      save: async () => {
        throw failure;
      },
    };
    const { hasher } = fakeHasher();

    await expect(
      new AuthenticatePlayer(players, hasher).execute({ username: "alice", password: "secret" }),
    ).rejects.toBe(failure);
  });

  it("propagates password hashing errors", async () => {
    const failure = new Error("hashing failed");
    const players = new InMemoryPlayerRepository();
    const { hasher } = fakeHasher({
      hash: async () => {
        throw failure;
      },
    });

    await expect(
      new AuthenticatePlayer(players, hasher).execute({ username: "alice", password: "secret" }),
    ).rejects.toBe(failure);
  });
});
