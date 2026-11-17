import { DomainError } from "../shared/domain-error";
import type { Notification } from "./notification";

export type DeliveryChannel = "IN_APP" | "EMAIL";
export type DeliveryStatus = "PENDING" | "SENT" | "FAILED";

/** One attempt-tracked delivery of a Notification over a channel (outbox row). */
export class Delivery {
  // Public for MikroORM hydration; application code should use Notification.create.
  constructor(
    private readonly _id: string,
    private readonly _notification: Notification,
    private readonly _channel: DeliveryChannel,
    private _status: DeliveryStatus = "PENDING",
    private _attempts = 0,
    private _lastError: string | null = null,
    private _lastAttemptAt: Date | null = null,
    private _sentAt: Date | null = null,
  ) {}

  get id(): string {
    return this._id;
  }

  get notification(): Notification {
    return this._notification;
  }

  get notificationId(): string {
    return this._notification.id;
  }

  get channel(): DeliveryChannel {
    return this._channel;
  }

  get status(): DeliveryStatus {
    return this._status;
  }

  get attempts(): number {
    return this._attempts;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get lastAttemptAt(): Date | null {
    return this._lastAttemptAt;
  }

  get sentAt(): Date | null {
    return this._sentAt;
  }

  recordSuccess(at: Date): void {
    this.assertPending();
    this._attempts += 1;
    this._lastAttemptAt = at;
    this._lastError = null;
    this._sentAt = at;
    this._status = "SENT";
  }

  /** Counts a failed attempt; the delivery becomes FAILED (terminal) once maxAttempts is reached. */
  recordFailure(error: string, at: Date, maxAttempts: number): void {
    this.assertPending();
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new DomainError("CONFLICT", "Max delivery attempts must be a positive integer");
    }
    this._attempts += 1;
    this._lastAttemptAt = at;
    this._lastError = error;
    if (this._attempts >= maxAttempts) this._status = "FAILED";
  }

  private assertPending(): void {
    if (this._status !== "PENDING") {
      throw new DomainError("CONFLICT", `Delivery is already ${this._status}`);
    }
  }
}
