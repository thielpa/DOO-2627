export const NOTIFICATION_TEST_DATABASE_NAME = "languageduel_notification_test";

/**
 * Validates the test target before any ORM connection. The Notification integration test applies
 * the real migrations and wipes the `public` schema, so it must never point at a development DB.
 */
export function requireNotificationTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "NOTIFICATION_TEST_DATABASE_URL must target the dedicated Notification test database.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NOTIFICATION_TEST_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("NOTIFICATION_TEST_DATABASE_URL must be a PostgreSQL connection URL.");
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("NOTIFICATION_TEST_DATABASE_URL must name the dedicated test database.");
  }

  if (databaseName !== NOTIFICATION_TEST_DATABASE_NAME) {
    throw new Error(
      `NOTIFICATION_TEST_DATABASE_URL must target database ${NOTIFICATION_TEST_DATABASE_NAME}.`,
    );
  }

  return url;
}
