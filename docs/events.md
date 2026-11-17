# Domain events

> **Status: proposal v1 - to be validated by the owner of the Match context.**
> The Notification context was built against this draft. Names, fields and semantics may change
> after that review; the types live in one neutral module so the change stays in one place.

Contracts are TypeScript types in `apps/api/src/domain/shared/events/`. Publishers (Match) and
subscribers (Notification) both depend on that module and never on each other's context.

## Envelope

Every event has the same envelope (`DomainEvent<Name, Payload>`).

| Field        | Type     | Meaning                                                           |
| ------------ | -------- | ----------------------------------------------------------------- |
| `eventId`    | `string` | UUID, unique per event. Subscribers use it for idempotency.       |
| `name`       | `string` | Event name, e.g. `TurnPassed`.                                    |
| `version`    | `1`      | Contract version. A breaking change to a payload introduces `2`.  |
| `occurredAt` | `Date`   | When the fact happened in the domain.                             |
| `payload`    | object   | Event-specific data, below. Contains IDs and facts only, no text. |

## Events

### `TurnPassed` v1

A Player finished their turn and the opponent is now to play.

| Field          | Type     | Meaning                          |
| -------------- | -------- | -------------------------------- |
| `matchId`      | `string` | The Match.                       |
| `fromPlayerId` | `string` | The Player who just finished.    |
| `toPlayerId`   | `string` | The Player whose turn it is now. |
| `roundNumber`  | `number` | The round the turn belongs to.   |

### `MatchCompleted` v1

The Match ended after all rounds were played.

| Field       | Type                     | Meaning                        |
| ----------- | ------------------------ | ------------------------------ |
| `matchId`   | `string`                 | The Match.                     |
| `playerIds` | `[string, string]`       | Both Players.                  |
| `winnerId`  | `string \| null`         | The winner, `null` for a draw. |
| `scores`    | `Record<string, number>` | Score per Player ID.           |

### `MatchExpired` v1

The Match ended because a Player did not take their turn in time.

| Field              | Type               | Meaning                                                 |
| ------------------ | ------------------ | ------------------------------------------------------- |
| `matchId`          | `string`           | The Match.                                              |
| `playerIds`        | `[string, string]` | Both Players.                                           |
| `winnerId`         | `string \| null`   | The winner (decided by Match rules), `null` if none.    |
| `missedByPlayerId` | `string \| null`   | The Player whose missed turn expired the Match, if any. |

## Delivery guarantee

- Events are delivered **in-process**, by a synchronous dispatcher, to registered handlers
  (`DomainEventHandler<E>.handle(event)`).
- Handlers run **before commit, inside the same Unit of Work (transaction)** that recorded the
  event. If a handler fails, the whole transaction rolls back, so a Match change and its
  notifications are saved together or not at all.
- Handlers must **not open their own transaction** and must **not call back into the publisher's
  context**.
- A handler may see the same `eventId` more than once (retries, replays). Handlers must be
  idempotent. The Notification handlers are: they skip an (`eventId`, recipient) pair they have
  already handled, and a unique constraint backs that up.
- There is no ordering guarantee between different events.

### Dispatcher contract for duplicates (decision D12 in `docs/design.md`)

Two concurrent requests can handle the same `eventId` for the same recipient: both pass
`existsForEvent`, and the second `NotificationRepository.save` fails on
`UNIQUE (event_id, recipient_id)` with `DomainError` `CONFLICT`. The dispatcher must therefore:

- run **each handler inside a SAVEPOINT** (nested transaction);
- treat `DomainError` with code `CONFLICT` from a notification handler as **"already processed"**:
  release or roll back that savepoint and continue with the next handler;
- let any other error roll back the whole transaction.

A duplicate notification must never roll back the Match change. The Notification code does not
use `ON CONFLICT DO NOTHING`.

Note for the dispatcher author: `NotificationRepository.save` calls `em.flush()`, which flushes the
whole Unit of Work, including pending Match changes, in the middle of the transaction. This is
harmless inside the transaction (it commits or rolls back as one), but writes made by the Match
side are sent to the database at that point, and a savepoint rollback also undoes what was flushed
after the savepoint was taken.

## Subscribers

| Subscriber (Notification context) | Event            | Effect                                                        |
| --------------------------------- | ---------------- | ------------------------------------------------------------- |
| `NotifyOnTurnPassed`              | `TurnPassed`     | Notifies `toPlayerId`.                                        |
| `NotifyOnMatchCompleted`          | `MatchCompleted` | Notifies both Players with their own outcome (won/lost/draw). |
| `NotifyOnMatchExpired`            | `MatchExpired`   | Notifies both Players with their own outcome.                 |

The handlers are exposed as `useCases.notificationEventHandlers`, keyed by event name, for the
dispatcher to register.

## Open questions for the Match context

1. Is `TurnPassed` raised once per turn, or only when the turn changes Player? Notification treats
   each event as one notification.
2. Does `MatchExpired.winnerId` follow from the missed turn, or can an expired Match have no winner?
3. Should `occurredAt` be set by the aggregate (domain time) or by the dispatcher?
4. Are IDs always UUIDs? The Notification tables store `eventId`, `matchId` and recipient IDs as `uuid`.
