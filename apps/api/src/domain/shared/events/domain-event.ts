/**
 * PROPOSAL v1 - to be validated by the Match context owner (see docs/events.md).
 *
 * Neutral contract shared by event publishers (Match) and subscribers (Notification).
 * Subscribers import only from this module, never from the publisher's context.
 */
export interface DomainEvent<Name extends string, Payload> {
  /** UUID, unique per event; subscribers use it for idempotency. */
  eventId: string;
  name: Name;
  version: 1;
  occurredAt: Date;
  payload: Payload;
}

/**
 * Called by the in-process dispatcher before commit, inside the same transaction (Unit of Work)
 * that recorded the event. Handlers must not open their own transaction.
 */
export interface DomainEventHandler<E> {
  handle(event: E): Promise<void>;
}
