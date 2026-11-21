# Domain events: subscriber side (Notification)

The event contract belongs to the Match context and is the authority: the TypeScript types in
[`apps/api/src/domain/shared/events/`](../apps/api/src/domain/shared/events/) (`DomainEvent`,
`TurnPassed`, `MatchCompleted`, `MatchExpired`). How events are recorded, dispatched and versioned
is described in [architecture.md](architecture.md#domain-events) and in
[design.md](design.md) (5.2). This page only describes how the Notification context uses them.

## Subscriptions

The handlers are registered in [`main.ts`](../apps/api/src/main.ts) with
`InProcessEventDispatcher.subscribe(type, handler)`, from `useCases.notificationEventHandlers`.

| Event            | Handler                  | Recipients                  | Notification type | Stored in `data`                                                       |
| ---------------- | ------------------------ | --------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `TurnPassed`     | `notifyOnTurnPassed`     | `toPlayerId` (the opponent) | `TURN_PASSED`     | `roundNumber`, `fromPlayerId`, `deadline` (ISO string)                 |
| `MatchCompleted` | `notifyOnMatchCompleted` | every ID in `playerIds`     | `MATCH_COMPLETED` | `outcome` (`WON`, `LOST`, `DRAW`), `winnerId`                          |
| `MatchExpired`   | `notifyOnMatchExpired`   | every ID in `playerIds`     | `MATCH_EXPIRED`   | `outcome` (`WON`, `LOST`, `NO_WINNER`), `winnerId`, `missedByPlayerId` |

`outcome` is computed per recipient from `winnerId`: `WON` if the recipient is the winner, `LOST`
if another player is, and without a winner `DRAW` for a completed match or `NO_WINNER` for an
expired one (if nobody answered yet, there is no winner). The notification keeps `eventId` and
`matchId`; the text is built in the web client from `type` and `data`.

The notification code imports only `domain/shared/events` from the Match side. Biome enforces this
(see `biome.json`, rule `noRestrictedImports`).

## Guarantees

- **Same transaction.** Handlers run inside the use case that dispatched the event, after the
  match was saved. The match change and its notifications are committed together or not at all.
  If a handler throws, the whole transaction rolls back.
- **No external calls.** Handlers only write the `Notification` and its `PENDING` `Delivery` rows
  (the outbox). The relay job sends them afterwards (design.md, 5.5).
- **Idempotent.** The same `eventId` may arrive more than once. Each notification is inserted with
  `INSERT ... ON CONFLICT (event_id, recipient_id) DO NOTHING`, and its deliveries only when the
  row was inserted. A duplicate is ignored and never aborts the match transaction (design.md,
  5.6). The dispatcher does not need to isolate handlers for this.
- **No ordering** between different events is assumed.
