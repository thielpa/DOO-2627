# Design Document

## What is the project?

**Quizduel** is a multiplayer quiz/trivia game. Players create an account, choose a game mode, and compete in matches by answering questions by category and difficulty. The game supports four modes: Solo (random opponent), Solo with Friend, Teams, and Tournament. Players earn scores, badges, and daily quest rewards, and can invite friends, form teams, and share results.

---

## Technology

| Concern | Choice |
|---|---|
| Frontend | React Web App (SPA) |
| Backend | Hono / Bun |
| Main database | PostgreSQL / SQLite |
| Cache | Redis / Valkey |

---

## Domain Model

> Full diagram: [`docs/DomainModel.pdf`](./DomainModel.pdf)

### Overview

The domain model captures all main concepts of the game and how they relate to each other.

- A **Player** has a username, email, and country. A player can calculate their total score and invite other players.
- A **Language** is associated with the Player (language preference).
- A **FriendRequest** is sent between players. It has a status (PENDING, ACCEPTED, EXPIRED) and an expiry date.
- A **SocialShare** records when a player shares results on an external platform.
- A **MatchInvitation** is used to invite a player to a match. It can be a CHALLENGE (1v1) or TEAM invitation.
- A **Lobby** holds the game mode chosen by the players (SOLO\_RANDOM, SOLO\_FRIEND, TEAMS, TOURNAMENT) and its current status (SEARCHING, READY, STARTED).
- A **Team** groups players together for team-based matches.
- A **Tournament** has a name, a phase (REGISTRATION, GROUP\_PHASE, ELIMINATION, ENDED), a max participant count, and a start date. It can assign groups and matches.
- A **TournamentGroup** belongs to a Tournament and has a group number.
- An **EliminationRound** belongs to a Tournament and tracks rounds before the finale.
- A **Match** records the game mode, difficulty, status (UPCOMING, STARTED, COMPLETED, EXPIRED), and start time. It can be started and ended (including by expiry).
- A **Round** belongs to a Match. It has a round number and a status (UPCOMING, STARTED, COMPLETED).
- A **PlayerAnswer** records how much time a player needed to answer a question in a round.
- A **Question** has a text, a difficulty level, and a time limit.
- A **Category** gives each question a topic name.
- An **AnswerOption** belongs to a Question and has a text and a flag indicating whether it is correct.
- A **Score** records the points earned by a player in a match and when it was calculated.
- **Reward** is an abstract class with a name, description, and condition string. It has two concrete subclasses:
  - **Badge** — adds a logo image.
  - **DailyQuest** — adds a validity date and a reward points value.
- A **RewardProgress** links a Player to a Reward and tracks progress, status (STARTED, COMPLETED), and whether the reward was claimed.
### Why these decisions?

- **`Reward` is abstract** — `Badge` and `DailyQuest` share name, description, and condition; only type-specific attributes differ.
- **`RewardProgress` as a separate class** — it sits between Player and Reward, tracking progress and claiming without changing either class.
- **`PlayerAnswer` in the Round** — captures time needed per question, required for scoring and deadline enforcement.
- **`MatchInvitation` separated from `FriendRequest`** — game invites and social friend requests have different lifecycles.
- **`Lobby` as matchmaking aggregate** — maps directly to the Matchmaking bounded context from Event Storming.
- **`Tournament` owns `TournamentGroup` and `EliminationRound`** — group and elimination phases have different structures, so each is a distinct owned object.

---

## Component Diagram
> Full diagram: [`docs/ComponentModel.pdf`](./ComponentModel.pdf)
> Full diagram: [`docs/ComponentModel.drawio`](./ComponentModel.drawio.xml)
> (open with [draw.io](https://app.diagrams.net/))

### Overview

The system is divided into four subsystems:

**1. Client Subsystem**
- `React Web App (SPA)` — the single-page application running in the browser. It communicates with the backend through a UI Interface over HTTPS / REST.

**2. Server Subsystem / API**
- `Backend API Server (Hono / Bun)` — the entry point for all client requests. It routes traffic to the internal services.
- Five internal services, each aligned with a Bounded Context from the Event Storming:

| Service | Responsibilities |
|---|---|
| Account / Profile | Create Account, Login, Choose Language. Aggregate: Player Profile. |
| Matchmaking | Game Mode selection (Solo, Solo with Friend, Teams, Tournament), Player Search, Team Formation, Tournament management. Aggregate: Lobby. |
| Match / Gameplay | Start Match, manage Rounds, Show Question, Choose Category, enforce deadlines, Complete or Expire Match. |
| Gamification | Calculate Score, Leaderboard, Badges, Daily Quests, Rewards. |
| Social | Friend Management (invite, accept, expire after 48 h), Results Sharing, push notification policy. |

**3. Persistence & Cache**
- `Main Database (PostgreSQL / SQLite)` — stores all persistent data. All services connect through a Database Interface.
- `In-Memory Cache (Redis / Valkey)` — used for fast access (e.g., active lobbies, leaderboard). All services connect through a Cache Interface.

**4. External Systems**
- `Identity Provider` — used by the Account/Profile service for authentication (HTTPS).
- `Notification Provider` — used by the Match service (question ready notification) and the Social service (friend invite notification) via HTTPS / Events.

### Service interaction flows

| From | To | Trigger |
|---|---|---|
| Account / Profile | Matchmaking | user logged in → Select game mode |
| Matchmaking | Match / Gameplay | match created |
| Match / Gameplay | Gamification | match completed → Calculate score |
| Account / Profile | Identity Provider | Login / Create Account |
| Match + Social | Notification Provider | question ready; friend invited |

### Why these decisions?

- **One service per Bounded Context** — each service is focused on one domain concern, directly mapped from the Event Storming.
- **React SPA** — avoids full page reloads, suitable for the real-time flow of match rounds.
- **Hono / Bun** — lightweight and TypeScript-native, keeping one language across frontend and backend.
- **Database + Cache via interfaces** — storage technology (PostgreSQL/SQLite, Redis/Valkey) can change without affecting service code.
- **External Identity and Notification providers** — authentication and push notifications are delegated to external systems, keeping those concerns out of the game services.

---

## Deliverables

| Artifact | Location |
|---|---|
| This design document | `docs/design.md` |
| Domain model (UML class diagram) | `docs/DomainModel.pdf` |
| Domain model (draw.io XML) | `docs/DomainModel.drawio` |
| Component diagram (draw.io XML) | `docs/Component_Diagram.drawio` |
| Component diagram (PDF) | `docs/Component_Diagram.pdf` |
| Event Storming source | `docs/Eventstorming.pdf` |
