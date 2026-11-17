import { describe, expect, it } from "bun:test";
import {
  NOTIFICATION_TEST_DATABASE_NAME,
  requireNotificationTestDatabaseUrl,
} from "./notification-test-database";

describe("Notification test database URL guard", () => {
  it("rejects a missing URL", () => {
    expect(() => requireNotificationTestDatabaseUrl(undefined)).toThrow(
      "NOTIFICATION_TEST_DATABASE_URL must target the dedicated Notification test database.",
    );
  });

  it("rejects the development database and non-PostgreSQL URLs", () => {
    expect(() =>
      requireNotificationTestDatabaseUrl("postgresql://u:p@localhost:5432/languageduel"),
    ).toThrow(`must target database ${NOTIFICATION_TEST_DATABASE_NAME}`);
    expect(() => requireNotificationTestDatabaseUrl("https://example.com/db")).toThrow(
      "must be a PostgreSQL connection URL",
    );
  });

  it("accepts the dedicated database without changing the URL", () => {
    const url = `postgresql://u:p@localhost:5432/${NOTIFICATION_TEST_DATABASE_NAME}`;
    expect(requireNotificationTestDatabaseUrl(url)).toBe(url);
  });
});
