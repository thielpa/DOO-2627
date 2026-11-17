# Design Document

## What is the project?

**Quizduel** is a multiplayer quiz/trivia game. Players create an account, choose a game mode, and compete in matches by answering questions by category and difficulty. The game supports four modes: Solo (random opponent), Solo with Friend, Teams, and Tournament. Players earn scores, badges, and daily quest rewards, and can invite friends, form teams, and share results.

---

## Iteration: 1 (06/11/2026)

## Objectives: Change Scenario, Coupling and Cohesion Analysis, and Design Decision

---

### 1. Change scenario

> **"Players can play against each other in real time, not only in alternating rounds."**

#### 1.1 Description

Today, each player plays at their own time and gets a notification when it is their turn. In the new scenario, a second game mode is added: **real time**.
- Players are online at the same time.
- Everyone sees the same question at the same moment, with a timer controlled by the server.
- When everyone has answered, or the time is over, the result is shown and the next question starts.
- If a player stays offline for too long, the match expires.

The **turn-based mode stays**, because the project description says players do not need to be online at the same time as their opponent.

#### 1.2 Why this change is plausible

- It is a common feature in quiz apps. Users usually ask for it after the asynchronous mode already exists.
- It keeps the goal of the product (practicing languages by playing against other people).
- It uses well-known technology (WebSocket).

#### 1.3 Parts of the system affected

| Part                                        | Impact                               |
| ------------------------------------------- | ------------------------------------ |
| Domain (`Lobby`, `Match`, `Round`)          | Small: new attributes                |
| Domain (player connection)                  | Medium: new class `PlayerConnection` |
| Client (React Web App)                      | Medium: live connection and timer    |
| Match / Gameplay Service                    | Small: new policies                  |
| Matchmaking Service                         | Small: choice of play mode           |
| Live connection handling                    | New                                  |
| Notification, Gamification, Social, Account | None                                 |

---

## 2. Situation before the change

The **Match / Gameplay Service** contains:
- **Match control:** start, expire and complete.
- **Round play:** choose category, show question, save answer.
- **Policies:** start next round and expire when the deadline passes.

Dependencies of the Match Service:
- **Incoming:** the Matchmaking Service creates the match.
- **Outgoing:** the Notification Interface warns the opponent, and the Gamification Service calculates the score when the match ends.

**Current cohesion:** high. The service only handles matches (functional cohesion). However, all policies assume turns and notifications.

---

## 3. Alternatives analyzed

**A. Everything in the Match Service.** The Match Service itself opens WebSocket connections, controls live timers and detects presence.

**B. New Real-Time Gateway component + `PlayMode` in the domain.** A dedicated component handles the live connection. The Match Service keeps the rules and only gets new policies for real-time mode.

**C. Separate service for real-time matches.** A full "Real-Time Match Service" with its own rules and model, next to the current Match Service.


#### D11. Cursor on `sentAt` and the multi-relay race

The cursor is a position in `(sentAt, id)` (D9). `sentAt` is set by the relay when it records the success, inside the relay transaction. If two or more relays run at the same time, relay X can take `sentAt = t1` but commit after relay Y has committed an item with `sentAt = t2 > t1` and a client has already polled past `t2`. The item of X then appears **behind** the client cursor and an incremental poll never returns it.

| Option                                    | Assessment                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. Cursor lookback (overlap window)       | Server returns items from `cursor - delta`; more data per poll and `delta` must exceed the longest relay transaction |
| B. Document that only one relay may run   | No code, but a silent constraint that breaks when the API is scaled out                                              |
| C. **Periodic full resync on the client** | No server change; the client also does a full list (no `since`) every N polls, on top of the focus resync            |

**Choice: C, with N = 12** (`FULL_RESYNC_EVERY_N_POLLS` in `apps/web/src/lib/notifications.ts`, about once a minute at 5 s). The counter resets on any full resync (focus, after mark-read, unread mismatch, periodic).

**Rationale.** The full resync is a bounded, cheap safety net (one extra request per minute, and `limit` items), and it also repairs other drift (read state changed on another device, see below). **Accepted cost:** an item can show up to about 60 s late, and only when 2 or more relays run concurrently. Today there is a single in-process relay with an overlap guard, so the race does not happen. The client also schedules a full resync when, after merging an incremental response, the server `unreadCount` differs from the number of unread items it holds (and no mark-read is pending), and it keeps at most the newest 50 items in the cache.

#### D12. Concurrent duplicate event in the dispatcher

Handlers check `existsForEvent` first and `UNIQUE (event_id, recipient_id)` is the backstop (D7). If two requests record the same event concurrently, both can pass the check and the second `save` fails with `DomainError CONFLICT`. In B's in-process dispatcher the handler runs inside the Match transaction, so an unhandled CONFLICT would roll back the **Match change** because of a duplicate notification.

| Option                                         | Assessment                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. `INSERT ... ON CONFLICT DO NOTHING`         | Atomic and no error, but the repository must report "not inserted" and the aggregate/children (deliveries) need special handling; changes the persistence code |
| B. **Savepoint per handler in the dispatcher** | The dispatcher runs each handler in a nested transaction; `CONFLICT` means "already processed"                                                                 |
| C. Accept the risk                             | A rare concurrent duplicate would fail the user's action                                                                                                       |

**Choice: B.** B's dispatcher must run each handler inside a SAVEPOINT (nested transaction) and treat `DomainError` `CONFLICT` thrown by a notification handler as "already processed": release or roll back the savepoint and continue. Any other error still rolls back the whole transaction. The Notification code is **not** changed to `ON CONFLICT`.

**Rationale.** The failure is a normal, expected outcome of at-least-once handling, and isolating handlers with a savepoint is a property the dispatcher needs anyway (a notification problem should not undo a Match change). This is a contract on Person B's code, documented in `docs/events.md`; until B implements it, the risk is the one of option C.

---

## 4. Cohesion analysis

| Criterion                               | A. Everything in Match Service                                                                  | B. Gateway + PlayMode              | C. Separate service                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Responsibility of the Match Service     | Mixes game rules with connection infrastructure (drops from functional to coincidental/logical) | Only game rules (stays functional) | Only turn-based rules                                   |
| Responsibility of the new component     | Does not exist                                                                                  | Only live connection (functional)  | Duplicated game rules                                   |
| Reasons for the Match Service to change | Game rules **and** transport technology                                                         | Only game rules                    | Turn-based rules                                        |
| Repeated rules                          | No                                                                                              | No                                 | Yes: score, rounds and end of match exist in two places |

## 5. Coupling analysis

| Criterion                                 | A. Everything in Match Service              | B. Gateway + PlayMode                                        | C. Separate service                                                           |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Coupling of Match to transport technology | High: Match Service depends on WebSocket    | None: only the Gateway knows WebSocket                       | None in Match; the new service depends on WebSocket                           |
| New dependencies between components       | None                                        | One, in one direction: Gateway → Match                       | Two: Matchmaking → both services; both → Gamification                         |
| Client interfaces                         | One interface that mixes HTTP and real time | Two separate interfaces: REST and WebSocket                  | Two different game routes                                                     |
| Shared state                              | Inside the same component                   | Match Service and Gateway use the cache through an interface | Two services write to the same database and cache, with risk of inconsistency |
| Risk to turn-based mode                   | High: same code is changed                  | Low: existing policies are kept                              | Low                                                                           |

## 6. Comparison summary

| Criterion                     | A                        | B               | C                             |
| ----------------------------- | ------------------------ | --------------- | ----------------------------- |
| Cohesion                      | Gets worse               | Stays           | Stays, with duplication       |
| Coupling                      | High with technology     | Low and one-way | Medium, with duplicated rules |
| Testing rules without network | Hard                     | Good            | Medium                        |
| Effort                        | Low at first, high later | Medium          | High                          |
| Risk to what already exists   | High                     | Low             | Low                           |

---

## 7. Design decision

> **Alternative B was chosen:** create the **Real-Time Gateway** component and add the **`PlayMode`** concept (`TURN_BASED` or `REAL_TIME`) to the domain.

### 7.1 Justification

1. **Cohesion is kept.** The Match Service keeps one responsibility: the match rules. The Gateway has one responsibility: live communication.
2. **Low, one-way coupling.** The Gateway depends on the Match Service, and the Match Service does not know WebSocket. A change of transport technology only affects the Gateway.
3. **No duplicated rules.** Score, rounds and end of match stay in one component. The Gamification Service is still called only by the Match Service.
4. **Turn-based mode is protected.** Notifications, deadlines and match expiration do not change.
5. **Existing architecture is reused.** The cache (Redis/Valkey) already in the diagram can hold the live state of matches.

### 7.2 Accepted costs

- One more component to maintain and monitor.
- The Match Service now has two families of policies (turn-based and real-time). If they grow, they can be split into strategies in the code.
- Reconnection and network failures must be handled, which was not needed before.

### 7.3 Open points

- Rule for speed-based score (the `timeNeeded` attribute of `PlayerAnswer` already allows it, but the rule is not defined).
- Maximum offline time before the match expires.
- Behavior when the connection drops: expire the match or go back to turn-based mode.

---

## 8. Effect on the diagrams

| Decision                                                  | Where it appears                                     |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `PlayMode` in `Lobby` and `Match`                         | `DomainModel.drawio`                                 |
| `PlayerConnection` and `ConnectionStatus`                 | `DomainModel.drawio`                                 |
| Real-Time Gateway, `WebSocket` interface and dependencies | `ComponentDiagram.drawio`                            |
| `async:` and `real-time:` policies                        | `ComponentDiagram.drawio` (Match / Gameplay Service) |


## Deliverables Iteration 1

| Artifact                         | Location                       |
| -------------------------------- | ------------------------------ |
| This design document             | `docs/design.md`               |
| Domain model (UML class diagram) | `docs/DomainModel.pdf`         |
| Domain model (draw.io XML)       | `docs/DomainModel.drawio`      |
| Component diagram (draw.io XML)  | `docs/ComponentDiagram.drawio` |
| Component diagram (PDF)          | `docs/ComponentDiagram.pdf`    |

## Iteration: 2 (sprint ending 23/11/2026)

## Objectives: Notification bounded context (Person C): Change Scenario, Coupling and Cohesion Analysis, and Design Decisions

---

### 1. Change scenario

> **"A player is told, inside the app, when something happens in their matches (their turn, a finished match, an expired match), even if the player is not looking at that match."**

#### 1.1 Description

In iteration 1 the notification was only a `<<use>>` dependency on the external Notification Interface. Now the **Notification** bounded context is implemented:
- Domain events of the match (`TurnPassed`, `MatchCompleted`, `MatchExpired`) create a **Notification** for each affected player.
- Each Notification has one **Delivery** per channel. Today only `IN_APP` exists; `EMAIL` is a port without implementation.
- The web client shows a bell with an unread counter and learns about new notifications by polling.

#### 1.2 Why this change is plausible

- The project description says players do not need to be online at the same time as the opponent, so they must be told when the match needs them.
- E-mail or push channels are a natural next request, so the context must accept new channels without changing the rules that create notifications.
- The Match context is owned by another person (Person B), so the contract between both contexts must be explicit.

#### 1.3 Parts of the system affected

| Part                                                      | Impact                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Notification context (domain, application, infra)         | New: `Notification`, `Delivery`, handlers, relay, repository         |
| Event contract (`domain/shared/events`, `docs/events.md`) | New: draft v1, proposed by Person C, to be validated by Person B     |
| Backend API (HTTP)                                        | New: `GET /api/notifications` and `POST /api/notifications/:id/read` |
| Client (React Web App)                                    | Medium: bell, polling with backoff, expired-match state              |
| Match / Gameplay Service                                  | Small, **not done here**: must publish the events (Person B)         |
| Database                                                  | New tables `notification` and `notification_delivery`                |
| Matchmaking, Gamification, Social, Account                | None                                                                 |

---

### 2. Situation before the change

- Match and Social called the Notification Interface directly (`<<use>>` arrows in the component diagram). There was no stored notification, no read state, and no guarantee that a notification is sent if (and only if) the match change was saved.
- A failure of the provider could break or silently lose the notification of a turn.

**Current cohesion:** low for notifications: the sending of messages is spread over the services that produce the facts.

---

### 3. Alternatives analyzed and decision records

The context is built around the **Transactional Outbox** pattern ([microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)). Its terms are used in the code and diagrams: _Sender_ (the service that changes the state), _Database_, _Message outbox_ (a table that stores the messages), and _Message relay_ (a process that reads the outbox and publishes). The pattern guarantees that "messages are sent if and only if the database transaction commits", and it does not need a distributed transaction (2PC). The relay has two known implementations, **Polling publisher** and **Transaction log tailing**. Because the relay "may publish a message more than once", consumers must be **idempotent** (for example by tracking the ids of processed messages), and message ordering must be considered.

For the client we follow the article of Anubhav, [_System Design Day 14: Polling — The Simplest Communication Pattern in Distributed Systems_](https://medium.com/@anubhav020909/system-design-day-14-polling-the-simplest-communication-pattern-in-distributed-systems-ebd78057e9eb) (Medium, 29/12/2025). Fixed-interval polling is the most common kind: simple, plain HTTP, no extra infrastructure. Short polling (around 300 ms) is called an anti-pattern, and long polling holds connections open. The article lists techniques that make polling safer (long polling, exponential backoff, timestamps or cursors, ETags / `If-Modified-Since`, random jitter, batching updates in one response). Polling fits infrequent updates, no strict real-time need and moderate scale, and many systems start with polling and move to push (WebSockets, SSE) when scale or latency demand it.

In the records below, **Outbox** means the microservices.io article and **Polling** means the Anubhav article.

#### D1. Event contract between Match and Notification

| Option                                                             | Assessment                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A. Wait for Person B to publish the contract                       | Blocks the sprint; the contract does not exist yet                                        |
| B. Notification calls Match/Matchmaking code or queries its tables | Direct coupling to another context, no isolation                                          |
| C. **Draft contract v1 in a neutral module, validated later by B** | Unblocks the work; both contexts depend on a small, stable contract and not on each other |

**Choice: C.** `DomainEvent<Name, Payload>` with `eventId`, `name`, `version`, `occurredAt`, `payload`, and the events `TurnPassed`, `MatchCompleted`, `MatchExpired`, in `apps/api/src/domain/shared/events/`, documented in `docs/events.md` as "proposal v1, to be validated by B". Notification imports only this module. Match event recording and the dispatcher are Person B's scope; here the handlers are tested with fake events.

**Rationale.** Outbox says the _Sender_ writes the message in its own transaction; for that the Sender needs an agreed message format. A versioned contract (`version: 1`) lets B change the payload later without breaking consumers silently. Dependency risk: if B changes names or fields, only the contract module and the handlers change.

#### D2. Branch stacked on PR #14

| Option                                              | Assessment                                             |
| --------------------------------------------------- | ------------------------------------------------------ |
| A. Branch from `main`                               | Needs a fake identity for the recipient                |
| B. **Stack on PR #14 (account / friend challenge)** | Uses the real session (`requireSession`, `playerIdOf`) |

**Choice: B.** Notifications belong to an authenticated player, and the friend-challenge context is the reference pattern for repositories, use cases and routes. The cost is that the PR must be merged after #14.

#### D3. IN_APP delivery goes through the outbox relay

| Option                                                                                              | Assessment                                                        |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A. In-app notification is visible as soon as it is saved; only e-mail uses the relay                | Two code paths; the in-app channel would not exercise the pattern |
| B. **Every Delivery is created `PENDING` in the same transaction as the event; the relay sends it** | One path for all channels; new channels need only a new sender    |

**Choice: B.** `InAppSender` just succeeds and marks the delivery `SENT`; `EmailSender` is only a port (`DeliverySender`) and no `EMAIL` delivery is created yet. "Read" is separate state (`readAt` on `Notification`). `GET` lists notifications whose `IN_APP` delivery is `SENT`.

**Rationale.** The Message outbox is the table of `Delivery` rows with status `PENDING`; the Message relay publishes them. Saving the Notification and its Deliveries in the same transaction as the event gives "sent if and only if the transaction commits" without 2PC (Outbox). A delivery state (`PENDING`, `SENT`, `FAILED`) is different from the read state, because a notification can be sent and still unread.

#### D4. What the Notification stores

| Option                                                                             | Assessment                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------- |
| A. Only the type and an id; read the rest from Match when shown                    | Cross-context queries; breaks isolation   |
| B. Final text stored in the database                                               | Fixes language and wording in the backend |
| C. **Type, `eventId`, `recipientId`, `matchId` and the data carried by the event** | Self-contained, no cross-context query    |

**Choice: C.** `data` is a small JSON object (for example `outcome` for the recipient and `winnerId`). The human text is built in the frontend from `type` and `data`.

**Rationale.** The Notification context must be readable without asking Match. The text stays in the client, where language and wording change often.

#### D5. Message relay = Polling publisher

| Option                     | Assessment (Outbox)                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| A. Transaction log tailing | No polling delay, but needs database-specific tooling (log reader, CDC) and extra infrastructure     |
| B. **Polling publisher**   | Simple; works with plain SQL on the current database; the cost is a small delay and repeated queries |

**Choice: B.** An interval job started in `main.ts` (`NOTIFICATION_RELAY_INTERVAL_MS`, default 1000) with its own EntityManager context (`em.fork()`) selects `PENDING` deliveries in batches with `FOR UPDATE SKIP LOCKED` inside a transaction.

**Rationale.** The load is low (a few notifications per match), so the Polling publisher is enough and needs no new infrastructure. `SKIP LOCKED` lets two instances of the API run the relay without sending the same row at the same time. If the volume grows, the relay can be replaced by log tailing without changing handlers or senders, because they only see the outbox.

#### D6. Retries

| Option                                                                 | Assessment                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A. Retry forever                                                       | A broken delivery blocks the batch and hides the problem                 |
| B. Exponential backoff per delivery                                    | Fewer wasted attempts, but needs a `nextAttemptAt` column and more rules |
| C. **Fixed interval: one attempt per relay cycle, at most N attempts** | Simple, observable, no extra column                                      |

**Choice: C.** Default N = 5 (`NOTIFICATION_MAX_ATTEMPTS`). On failure: `attempts++`, `lastError`, `lastAttemptAt`; when `attempts` reaches N the delivery becomes `FAILED` (terminal).

**Rationale.** The only sender today is `InAppSender`, which hardly fails. A bounded number of attempts gives a clear end state. Backoff per delivery is a future step for real external channels (e-mail).

#### D7. Idempotency

| Option                                                  | Assessment                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| A. Hope the event is handled once                       | Not true: the relay is at-least-once and a dispatcher can repeat events |
| B. Check only in code                                   | Race between two handlers                                               |
| C. **Check in the handler and add a UNIQUE constraint** | Simple check in the normal case, database as the last guard             |

**Choice: C.** `Notification` has `eventId`; `UNIQUE (event_id, recipient_id)`. The handler first asks `existsForEvent(eventId, recipientId)`; the constraint is the backstop. The `Delivery.id` is passed to senders as the idempotency key.

**Rationale.** Outbox states that the Message relay "may publish a message more than once", so the consumer must be an idempotent consumer that tracks the ids of processed messages; here the processed id is `(eventId, recipientId)`. Message ordering is not guaranteed across notifications, which is acceptable because each notification is independent and the list is ordered by when it became visible (D9), not by `createdAt`.

#### D8. Isolation enforced by tool

| Option                                      | Assessment                                   |
| ------------------------------------------- | -------------------------------------------- |
| A. Convention in the documentation          | Easy to break in a review that is in a hurry |
| B. **Biome `noRestrictedImports` override** | Fails the CI when the rule is broken         |

**Choice: B.** A new override in the root `biome.json` for notification files (`domain/notification/**`, `application/notification/**`, the notification infrastructure and the HTTP route) forbids imports of `domain/match` and `domain/matchmaking`, using the specific paths and their index re-exports where feasible. Allowed: `domain/shared/events`.

**Rationale.** The decision of D1 is only worth something if it is enforced. Low coupling is checked by the CI (`bunx biome ci .`), not by memory.

#### D9. Polling API: cursor and ETag

| Option                         | Assessment (Polling)                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| A. Always return the full list | Simple, but repeats data and cost grows with the history          |
| B. Cursor only                 | Returns only new items, but an unchanged answer still has a body  |
| C. ETag only                   | Saves bandwidth, but not the work of reading old items            |
| D. **Cursor and ETag**         | Delta of new items, and a `304` with no body when nothing changed |

**Choice: D.** `GET /api/notifications?since=<cursor>&limit=<1..50, default 20>` returns `{ items, unreadCount, cursor }`; the cursor is opaque (the position of the newest visible item) and stays the same if there is nothing new. The server sends an `ETag` built from the polling state of the recipient (count, last update, unread count, `since`, `limit`) and answers `If-None-Match` with `304`. All new items come in one response (batching). `POST /api/notifications/:id/read` returns `204` and is idempotent; `404` if the notification is not the caller's.

**Rationale.** These are three of the techniques listed by Polling: timestamps or cursors, ETags / `If-Modified-Since`, and batching updates in one response. They make the common case (nothing new) cheap.

**Ordering and cursor (deliberate deviation from the original spec).** The original spec sorted the list by `createdAt`. The list is instead ordered by the `sentAt` of the IN_APP delivery, then by `id` (newest first), and the cursor is the position `(sentAt, id)` of the newest item **returned**. Reason: an item is visible only after the relay sends it, so visibility depends on the relay. With `createdAt`, an item created earlier but sent later would land _behind_ a client cursor and never be returned. With `sentAt` the stream only grows at its end, which is what a cursor needs. With `since`, the server returns the **oldest** `limit` items after the cursor (ascending `(sentAt, id)`, shown newest first) and the cursor moves to the newest of those, so a backlog larger than `limit` is delivered over successive polls without skipping any item. Ties on `sentAt` are broken by `id`. The supporting indexes are on `notification_delivery`: `(notification_id, channel, status)` for the visibility lookups, and a partial index on PENDING rows for the relay claim.

#### D10. Client polling policy

| Option                                                           | Assessment (Polling)                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A. Short polling (around 300 ms)                                 | Called an anti-pattern: load without benefit                                                                  |
| B. Long polling                                                  | Holds connections; more server work; not needed for infrequent updates                                        |
| C. WebSocket / SSE now                                           | Needs connection handling; too much for this change (the Real-Time Gateway already exists for live play only) |
| D. **Fixed-interval polling, every 5 s, with safety techniques** | Simplest, plain HTTP, no extra infrastructure                                                                 |

**Choice: D.** React Query polls every 5 s; it pauses when the tab is hidden (`refetchIntervalInBackground: false`) and refetches on focus; on error it uses exponential backoff (5 s, 10 s, 20 s, up to 60 s) and returns to 5 s after a success. Cursor, ETag and batching come from D9. **Not adopted:** random jitter (few clients, no synchronized start, so no thundering herd to spread) and adaptive polling (the interval is not changed according to activity, to keep the behavior predictable).

**Rationale.** 5 s is a fixed-interval polling, not the short polling of the anti-pattern. A turn-based game has infrequent updates, no strict real-time need and a moderate scale, which is where Polling says polling fits. **Evolution path:** when scale or latency demand it, replace the polling by push (SSE or WebSocket). Only the transport changes: the outbox, the handlers, the `Notification` model and the API view stay. The Real-Time Gateway of iteration 1 is a possible host for it.

---

## 4. Cohesion analysis

| Criterion                          | Before (direct `<<use>>` calls)       | After (Notification context)                                |
| ---------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Responsibility of Match            | Rules **and** the sending of messages | Only rules; it publishes events                             |
| Responsibility of Notification     | Does not exist                        | Create, store, deliver and read notifications (functional)  |
| Reasons for Notification to change | -                                     | New channel, new notification text or type, delivery policy |
| Repeated rules                     | Each service decides when to notify   | One place maps events to recipients                         |

## 5. Coupling analysis

| Criterion                          | Before                       | After                                                              |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Match → Notification               | Direct call to the interface | Match depends only on the event contract (published by B)          |
| Notification → Match / Matchmaking | -                            | None in code (Biome rule, D8); ids only (`recipientId`, `matchId`) |
| Shared state                       | Not stored                   | Own tables; saved in the Unit of Work of the caller                |
| Client interface                   | Not defined                  | One REST interface, polled; replaceable by SSE/WebSocket           |
| External provider                  | Called inside the use case   | Behind the `DeliverySender` port, called by the relay              |

### 5.1 Accepted costs

- Delivery is **eventually consistent**: a notification appears after the next relay cycle (about 1 s) and the next client poll (up to 5 s).
- Duplicates are possible at the relay, so every consumer and sender must be idempotent.
- Polling creates constant (small) traffic; an `ETag` reduces the size of the answer but not the number of requests.
- The work is blocked until Person B publishes the events and the dispatcher; the contract is a proposal until B validates it.

### 5.2 Open points

- Validation of the event contract v1 by Person B (names, fields, versioning).
- Retention of old notifications and a limit of the table size.
- Ordering: notifications are ordered by the `sentAt` of the IN_APP delivery, then by `id` (D9); this is not creation order, and strict ordering of deliveries is not guaranteed.
- When to add the `EMAIL` channel, and a backoff policy for it.
- When to replace polling by SSE or WebSocket.

---

## 6. Effect on the diagrams

| Decision                                                                              | Where it appears                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Notification`, `Delivery`, `NotificationType`, `DeliveryChannel`, `DeliveryStatus`   | `DomainModel.drawio` (package Notification)             |
| `<<event>>` `TurnPassed`, `MatchCompleted`, `MatchExpired` (contract v1)              | `DomainModel.drawio`                                    |
| `recipientId` and `matchId` as plain ids (no association)                             | `DomainModel.drawio`                                    |
| Notification Service (handlers, repository / outbox, message relay, `DeliverySender`) | `ComponentDiagram.drawio`                               |
| Match → events → Notification handlers → outbox → relay                               | `ComponentDiagram.drawio`                               |
| Web client → `GET /api/notifications`, `POST /api/notifications/:id/read`             | `ComponentDiagram.drawio` (Notifications API interface) |

The old arrows Match → Notification Interface and Social → Notification Interface were kept but rerouted to make room; the external Notification Interface is reused (future `EmailSender`) and not duplicated. The PDFs were not regenerated because they need draw.io; they show iteration 1 until they are exported again.

## Deliverables Iteration 2

| Artifact                                 | Location                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| This design document                     | `docs/design.md`                                       |
| Event contract (draft v1)                | `docs/events.md`, `apps/api/src/domain/shared/events/` |
| Domain model (draw.io XML)               | `docs/DomainModel.drawio`                              |
| Component diagram (draw.io XML)          | `docs/ComponentDiagram.drawio`                         |
| Domain model and component diagram (PDF) | to be exported again from the draw.io files            |

### References

- Transactional Outbox, microservices.io: https://microservices.io/patterns/data/transactional-outbox.html
- Anubhav, "System Design Day 14: Polling — The Simplest Communication Pattern in Distributed Systems", Medium, 29/12/2025: https://medium.com/@anubhav020909/system-design-day-14-polling-the-simplest-communication-pattern-in-distributed-systems-ebd78057e9eb

## Deliverables Iteration 0

| Artifact                        | Location                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| This design document            | [`docs/design.md`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/design.md)                             | :   | Domain model (UML class diagram) | [`docs/DomainModel.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/DomainModel.pdf) |
| Domain model (draw.io XML)      | [`docs/DomainModel.drawio`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/DomainModel.drawio)           |
| Component diagram (draw.io XML) | [`docs/ComponentDiagram.drawio`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/ComponentDiagram.drawio) |
| Component diagram (PDF)         | [`docs/ComponentDiagram.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/ComponentDiagram.pdf)       |
| Event Storming source           | [`docs/Eventstorming.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/Eventstorming.pdf)             |
