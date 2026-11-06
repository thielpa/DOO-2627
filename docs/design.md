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

| Part | Impact |
|---|---|
| Domain (`Lobby`, `Match`, `Round`) | Small: new attributes |
| Domain (player connection) | Medium: new class `PlayerConnection` |
| Client (React Web App) | Medium: live connection and timer |
| Match / Gameplay Service | Small: new policies |
| Matchmaking Service | Small: choice of play mode |
| Live connection handling | New |
| Notification, Gamification, Social, Account | None |

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

---

## 4. Cohesion analysis

| Criterion | A. Everything in Match Service | B. Gateway + PlayMode | C. Separate service |
|---|---|---|---|
| Responsibility of the Match Service | Mixes game rules with connection infrastructure (drops from functional to coincidental/logical) | Only game rules (stays functional) | Only turn-based rules |
| Responsibility of the new component | Does not exist | Only live connection (functional) | Duplicated game rules |
| Reasons for the Match Service to change | Game rules **and** transport technology | Only game rules | Turn-based rules |
| Repeated rules | No | No | Yes: score, rounds and end of match exist in two places |

## 5. Coupling analysis

| Criterion | A. Everything in Match Service | B. Gateway + PlayMode | C. Separate service |
|---|---|---|---|
| Coupling of Match to transport technology | High: Match Service depends on WebSocket | None: only the Gateway knows WebSocket | None in Match; the new service depends on WebSocket |
| New dependencies between components | None | One, in one direction: Gateway → Match | Two: Matchmaking → both services; both → Gamification |
| Client interfaces | One interface that mixes HTTP and real time | Two separate interfaces: REST and WebSocket | Two different game routes |
| Shared state | Inside the same component | Match Service and Gateway use the cache through an interface | Two services write to the same database and cache, with risk of inconsistency |
| Risk to turn-based mode | High: same code is changed | Low: existing policies are kept | Low |

## 6. Comparison summary

| Criterion | A | B | C |
|---|---|---|---|
| Cohesion | Gets worse | Stays | Stays, with duplication |
| Coupling | High with technology | Low and one-way | Medium, with duplicated rules |
| Testing rules without network | Hard | Good | Medium |
| Effort | Low at first, high later | Medium | High |
| Risk to what already exists | High | Low | Low |

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

| Decision | Where it appears |
|---|---|
| `PlayMode` in `Lobby` and `Match` | `DomainModel.drawio` |
| `PlayerConnection` and `ConnectionStatus` | `DomainModel.drawio` |
| Real-Time Gateway, `WebSocket` interface and dependencies | `ComponentDiagram.drawio` |
| `async:` and `real-time:` policies | `ComponentDiagram.drawio` (Match / Gameplay Service) |


## Deliverables Iteration 1

| Artifact | Location |
|---|---|
| This design document | `docs/design.md` |
| Domain model (UML class diagram) | `docs/DomainModel.pdf` |
| Domain model (draw.io XML) | `docs/DomainModel.drawio` |
| Component diagram (draw.io XML) | `docs/ComponentDiagram.drawio` |
| Component diagram (PDF) | `docs/ComponentDiagram.pdf` |

## Deliverables Iteration 0

| Artifact | Location |
|---|---|
| This design document | [`docs/design.md`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/design.md) |:| Domain model (UML class diagram) | [`docs/DomainModel.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/DomainModel.pdf) |
| Domain model (draw.io XML) | [`docs/DomainModel.drawio`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/DomainModel.drawio) |
| Component diagram (draw.io XML) | [`docs/ComponentDiagram.drawio`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/ComponentDiagram.drawio) |
| Component diagram (PDF) | [`docs/ComponentDiagram.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/ComponentDiagram.pdf) |
| Event Storming source | [`docs/Eventstorming.pdf`](https://github.com/thielpa/DOO-2627/blob/iteration-0/docs/Eventstorming.pdf) |
