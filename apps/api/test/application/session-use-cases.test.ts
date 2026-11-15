import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { CreateSession, SESSION_LIFETIME_MS } from "../../src/application/create-session";
import { InvalidateSession } from "../../src/application/invalidate-session";
import { ValidateSession } from "../../src/application/validate-session";
import { InMemorySessionRepository } from "../support/in-memory-repositories";

const playerId = "00000000-0000-4000-8000-000000000001";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

describe("session use cases", () => {
  it("creates a seven-day session and persists only the SHA-256 token digest", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const sessions = new InMemorySessionRepository();
    const created = await new CreateSession(sessions, () => now).execute(playerId);
    const stored = await sessions.byTokenDigest(digest(created.token));

    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created.expiresAt.getTime() - now.getTime()).toBe(SESSION_LIFETIME_MS);
    expect(stored?.tokenDigest).toBe(digest(created.token));
    expect(stored?.tokenDigest).not.toBe(created.token);
    expect(JSON.stringify(stored)).not.toContain(stored?.tokenDigest);
    expect(await sessions.byTokenDigest(created.token)).toBeNull();
  });

  it("validates token digest and expiry without extending the session", async () => {
    let now = new Date("2026-11-15T12:00:00Z");
    const sessions = new InMemorySessionRepository();
    const created = await new CreateSession(sessions, () => now).execute(playerId);
    const validate = new ValidateSession(sessions, () => now);

    expect(await validate.execute(created.token)).toEqual({
      sessionId: expect.any(String),
      playerId,
    });
    expect(await validate.execute("unknown-token")).toBeNull();

    now = created.expiresAt;
    expect(await validate.execute(created.token)).toBeNull();
    expect((await sessions.byTokenDigest(digest(created.token)))?.expiresAt).toEqual(created.expiresAt);
  });

  it("invalidates only the session matching the supplied token", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const sessions = new InMemorySessionRepository();
    const create = new CreateSession(sessions, () => now);
    const first = await create.execute(playerId);
    const second = await create.execute(playerId);
    const invalidate = new InvalidateSession(sessions, () => now);
    const validate = new ValidateSession(sessions, () => now);

    await invalidate.execute(first.token);
    await invalidate.execute(first.token);

    expect(await validate.execute(first.token)).toBeNull();
    expect(await validate.execute(second.token)).toMatchObject({ playerId });
    expect((await sessions.byTokenDigest(digest(first.token)))?.invalidatedAt).toEqual(now);
    expect((await sessions.byTokenDigest(digest(second.token)))?.invalidatedAt).toBeNull();
  });

  it("propagates repository failures", async () => {
    const failure = new Error("session store unavailable");
    const sessions = {
      byTokenDigest: async () => {
        throw failure;
      },
      save: async () => {
        throw failure;
      },
    };

    await expect(new ValidateSession(sessions, () => new Date()).execute("token")).rejects.toBe(failure);
    await expect(new InvalidateSession(sessions, () => new Date()).execute("token")).rejects.toBe(failure);
    await expect(new CreateSession(sessions, () => new Date()).execute(playerId)).rejects.toBe(failure);
  });
});
