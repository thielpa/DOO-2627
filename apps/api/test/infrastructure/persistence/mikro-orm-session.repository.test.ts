import { describe, expect, it } from "bun:test";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Session } from "../../../src/domain";
import { MikroOrmSessionRepository } from "../../../src/infrastructure/persistence/repositories/mikro-orm-session.repository";
import { SessionSchema } from "../../../src/infrastructure/persistence/schemas/session.schema";

describe("MikroOrmSessionRepository", () => {
  it("looks up a session by token digest and persists invalidation state", async () => {
    const session = Session.create(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "a".repeat(64),
      new Date("2026-11-22T12:00:00Z"),
    );
    let where: Record<string, unknown> | undefined;
    let persisted: Session | undefined;
    const em = {
      findOne: async (_entity: unknown, query: Record<string, unknown>) => {
        where = query;
        return session;
      },
      persist: (entity: Session) => ({ flush: async () => { persisted = entity; } }),
    } as unknown as EntityManager;
    const repository = new MikroOrmSessionRepository(em);

    expect(await repository.byTokenDigest(session.tokenDigest)).toBe(session);
    session.invalidate(new Date("2026-11-16T12:00:00Z"));
    await repository.save(session);

    expect(where).toEqual({ _tokenDigest: session.tokenDigest });
    expect(persisted).toBe(session);
  });
});

describe("Session persistence schema", () => {
  it("maps the digest, expiry, and invalidation fields", () => {
    const properties = SessionSchema.meta.properties as unknown as Record<
      string,
      { fieldName?: string; unique?: boolean; nullable?: boolean }
    >;

    expect(SessionSchema.meta.tableName).toBe("session");
    expect(properties._id?.fieldName).toBe("id");
    expect(properties._playerId?.fieldName).toBe("player_id");
    expect(properties._tokenDigest?.fieldName).toBe("token_digest");
    expect(properties._tokenDigest?.unique).toBe(true);
    expect(properties._expiresAt?.fieldName).toBe("expires_at");
    expect(properties._invalidatedAt?.fieldName).toBe("invalidated_at");
    expect(properties._invalidatedAt?.nullable).toBe(true);
  });
});
