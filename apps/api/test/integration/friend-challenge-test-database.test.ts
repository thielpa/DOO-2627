import { describe, expect, it } from "bun:test";
import {
  FRIEND_CHALLENGE_TEST_DATABASE_NAME,
  requireFriendChallengeTestDatabaseUrl,
} from "./friend-challenge-test-database";

describe("Friend Challenge test database URL guard", () => {
  it("rejects a missing URL with a clear message", () => {
    expect(() => requireFriendChallengeTestDatabaseUrl(undefined)).toThrow(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must target the dedicated Friend Challenge test database.",
    );
    expect(() => requireFriendChallengeTestDatabaseUrl("")).toThrow(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must target the dedicated Friend Challenge test database.",
    );
  });

  it("rejects the development database", () => {
    expect(() =>
      requireFriendChallengeTestDatabaseUrl(
        "postgresql://user:password@localhost:5432/languageduel",
      ),
    ).toThrow(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must target database " +
        FRIEND_CHALLENGE_TEST_DATABASE_NAME,
    );
  });

  it("accepts the dedicated PostgreSQL test database without changing the URL", () => {
    const url = `postgresql://user:password@localhost:5432/${FRIEND_CHALLENGE_TEST_DATABASE_NAME}`;
    expect(requireFriendChallengeTestDatabaseUrl(url)).toBe(url);
  });

  it("rejects malformed and non-PostgreSQL URLs without echoing them", () => {
    const malformed = "postgresql://user:password@localhost:5432/%ZZ";
    expect(() => requireFriendChallengeTestDatabaseUrl(malformed)).toThrow();
    try {
      requireFriendChallengeTestDatabaseUrl(malformed);
    } catch (error) {
      expect((error as Error).message).not.toContain("password");
    }
    expect(() => requireFriendChallengeTestDatabaseUrl("https://example.com/database")).toThrow(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must be a PostgreSQL connection URL.",
    );
  });
});
