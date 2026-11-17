import { describe, expect, it } from "bun:test";
import { DomainError, Notification } from "../../src/domain";

const t0 = new Date("2026-11-17T10:00:00Z");
const t1 = new Date("2026-11-17T10:00:05Z");

function newNotification(channels: ("IN_APP" | "EMAIL")[] = ["IN_APP"]) {
  return Notification.create(
    "n-1",
    {
      recipientId: "bob",
      type: "TURN_PASSED",
      eventId: "e-1",
      matchId: "m-1",
      data: { roundNumber: 2, fromPlayerId: "alice" },
      channels,
      deliveryIds: channels.map((_, i) => `d-${i}`),
    },
    t0,
  );
}

describe("Notification", () => {
  it("is created unread with one PENDING delivery per channel", () => {
    const notification = newNotification(["IN_APP", "EMAIL"]);
    expect(notification.readAt).toBeNull();
    expect(notification.updatedAt).toEqual(t0);
    expect(notification.deliveries.map((d) => [d.id, d.channel, d.status, d.attempts])).toEqual([
      ["d-0", "IN_APP", "PENDING", 0],
      ["d-1", "EMAIL", "PENDING", 0],
    ]);
    expect(notification.isVisibleInApp()).toBe(false);
    expect(notification.visibleAt()).toBeNull();
  });

  it("rejects missing deliveries, duplicate channels and mismatched IDs", () => {
    const base = {
      recipientId: "bob",
      type: "TURN_PASSED" as const,
      eventId: "e",
      matchId: "m",
      data: {},
    };
    expect(() => Notification.create("n", { ...base, channels: [], deliveryIds: [] }, t0)).toThrow(
      DomainError,
    );
    expect(() =>
      Notification.create(
        "n",
        { ...base, channels: ["IN_APP", "IN_APP"], deliveryIds: ["a", "b"] },
        t0,
      ),
    ).toThrow(DomainError);
    expect(() =>
      Notification.create("n", { ...base, channels: ["IN_APP"], deliveryIds: [] }, t0),
    ).toThrow(DomainError);
  });

  it("becomes visible in the app when the IN_APP delivery is sent", () => {
    const notification = newNotification();
    notification.recordDeliverySuccess("d-0", t1);
    expect(notification.isVisibleInApp()).toBe(true);
    expect(notification.visibleAt()).toEqual(t1);
    expect(notification.updatedAt).toEqual(t1);
  });

  it("keeps the first read time when marked read twice", () => {
    const notification = newNotification();
    notification.markRead(t1);
    notification.markRead(new Date("2026-11-17T11:00:00Z"));
    expect(notification.readAt).toEqual(t1);
    expect(notification.updatedAt).toEqual(t1);
  });

  it("rejects a read time before creation", () => {
    expect(() => newNotification().markRead(new Date("2026-11-17T09:00:00Z"))).toThrow(DomainError);
  });

  it("does not expose its data for mutation", () => {
    const notification = newNotification();
    notification.data.roundNumber = 99;
    expect(notification.data.roundNumber).toBe(2);
  });
});

describe("Delivery", () => {
  it("counts failures and fails terminally at max attempts", () => {
    const notification = newNotification();
    const delivery = notification.deliveries[0];
    if (!delivery) throw new Error("delivery expected");

    notification.recordDeliveryFailure("d-0", "smtp down", t1, 3);
    expect(delivery.status).toBe("PENDING");
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastError).toBe("smtp down");
    expect(delivery.lastAttemptAt).toEqual(t1);

    notification.recordDeliveryFailure("d-0", "smtp down", t1, 3);
    notification.recordDeliveryFailure("d-0", "still down", t1, 3);
    expect(delivery.status).toBe("FAILED");
    expect(delivery.attempts).toBe(3);
    expect(notification.isVisibleInApp()).toBe(false);
  });

  it("clears the last error on success and stays SENT", () => {
    const notification = newNotification();
    const delivery = notification.deliveries[0];
    notification.recordDeliveryFailure("d-0", "boom", t1, 5);
    notification.recordDeliverySuccess("d-0", t1);
    expect(delivery?.status).toBe("SENT");
    expect(delivery?.lastError).toBeNull();
    expect(delivery?.attempts).toBe(2);
    expect(delivery?.sentAt).toEqual(t1);
  });

  it("rejects transitions out of terminal states", () => {
    const sent = newNotification();
    sent.recordDeliverySuccess("d-0", t1);
    expect(() => sent.recordDeliverySuccess("d-0", t1)).toThrow(DomainError);
    expect(() => sent.recordDeliveryFailure("d-0", "x", t1, 5)).toThrow(DomainError);

    const failed = newNotification();
    failed.recordDeliveryFailure("d-0", "x", t1, 1);
    expect(() => failed.recordDeliverySuccess("d-0", t1)).toThrow(DomainError);
  });

  it("rejects an invalid max attempts and unknown delivery IDs", () => {
    const notification = newNotification();
    expect(() => notification.recordDeliveryFailure("d-0", "x", t1, 0)).toThrow(DomainError);
    expect(() => notification.recordDeliverySuccess("nope", t1)).toThrow(DomainError);
  });
});
