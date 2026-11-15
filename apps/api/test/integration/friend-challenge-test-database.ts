export const FRIEND_CHALLENGE_TEST_DATABASE_NAME = "languageduel_friend_challenge_test";

/** Validates the test target before any ORM connection or schema operation begins. */
export function requireFriendChallengeTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must target the dedicated Friend Challenge test database.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("FRIEND_CHALLENGE_TEST_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("FRIEND_CHALLENGE_TEST_DATABASE_URL must be a PostgreSQL connection URL.");
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("FRIEND_CHALLENGE_TEST_DATABASE_URL must name the dedicated test database.");
  }

  if (databaseName !== FRIEND_CHALLENGE_TEST_DATABASE_NAME) {
    throw new Error(
      "FRIEND_CHALLENGE_TEST_DATABASE_URL must target database " +
        FRIEND_CHALLENGE_TEST_DATABASE_NAME + ".",
    );
  }

  return url;
}
