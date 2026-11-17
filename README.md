# Quizduel for Language Learning

Learning a language is easier and more fun with friends. This app lets you practice vocabulary and grammar by playing short quiz games against other people. You answer questions, your opponent does the same, and whoever gets more right wins.

## How it works

Pick the language you want to practice and how hard you want the questions to be. Then choose how you want to play:

- **Solo:** You are matched with a random player at a similar level.
- **Against a friend:** You challenge someone you know.
- **In teams:** You team up with friends and play against another team.
- **In a tournament:** You compete against many players in a group phase, and the best ones move on to a knockout phase until a winner is found.

A game has several rounds. In each round you choose a topic, such as food or travel, and answer a few questions. You don't need to be online at the same time as your opponent. You take your turn whenever you like, and you get a notification when it's your move again.

## Learning while playing

After every answer, you see right away whether you were correct. If you didn't know it, or the time ran out, the app shows you the right answer, so you learn something new even when you lose.

## Playing with friends

You can send friend requests, challenge friends to a game, invite them to your team, and share your results on social media. A leaderboard shows how you rank against other players.

## Staying motivated

- **Badges** reward achievements, such as winning several games in a row.
- **Daily quests** give you small goals, like "play three games today", and you can claim a reward when you finish them.

## Who is it for?

Anyone learning a language who wants short, playful practice sessions instead of boring drills, whether alone, with friends, or with classmates.

## Development

Requirements: [Bun](https://bun.sh) and Docker.

```sh
bun install
cp apps/api/.env.example apps/api/.env
bun run db:up          # start Postgres
bun run --filter @languageduel/api orm migration:up   # create tables
bun run --filter @languageduel/api seed               # add categories and questions
bun run dev            # API on http://localhost:3000, web on http://localhost:5173
```

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `bun run build`     | Build all packages            |
| `bun run test`      | Run all tests                 |
| `bun run typecheck` | Type-check all packages       |
| `bun run lint`      | Lint and format check (Biome) |
| `bun run format`    | Apply Biome fixes             |

### Integration tests

Most tests run without a database. The PostgreSQL integration tests (`apps/api/test/integration`)
need dedicated, throwaway databases, because they create and drop their own tables. They refuse to
run against any other database name. With the Postgres container from `bun run db:up` running:

```sh
docker compose exec postgres createdb -U languageduel languageduel_friend_challenge_test
docker compose exec postgres createdb -U languageduel languageduel_notification_test

export FRIEND_CHALLENGE_TEST_DATABASE_URL=postgres://languageduel:languageduel@localhost:5432/languageduel_friend_challenge_test
export NOTIFICATION_TEST_DATABASE_URL=postgres://languageduel:languageduel@localhost:5432/languageduel_notification_test
bun run test
```

| Variable                             | Database                             | Test                              |
| ------------------------------------ | ------------------------------------ | --------------------------------- |
| `FRIEND_CHALLENGE_TEST_DATABASE_URL` | `languageduel_friend_challenge_test` | Friend challenge concurrency      |
| `NOTIFICATION_TEST_DATABASE_URL`     | `languageduel_notification_test`     | Notification repository and relay |

The Notification test applies the real migrations to its database and wipes the `public` schema
first. In CI both databases are created by the workflow.

### Notifications

The API runs a notification relay (outbox polling publisher) every
`NOTIFICATION_RELAY_INTERVAL_MS` (default `1000`). A delivery is retried once per cycle and fails
after `NOTIFICATION_MAX_ATTEMPTS` attempts (default `5`).

Notifications API (session required, mounted at `/api/notifications`):

- `GET /api/notifications?since=<cursor>&limit=<1..50, default 20>` returns
  `{ items, unreadCount, cursor }`, newest first, ordered by when the IN_APP delivery was sent (then
  id), only for notifications already `SENT`. With `since`, it returns the oldest `limit` items
  after the cursor, so a larger backlog arrives over successive polls.
- `POST /api/notifications/:id/read` returns `204` and is idempotent. `404` if the notification
  does not exist or is not the caller's. Ownership is the only check: a notification that is still
  `PENDING` (not yet sent by the relay, so not in the list) can be marked read by its owner.

Database migrations: `bun run --filter @languageduel/api orm migration:create` / `migration:up`.

To try a match locally, open the web app in a normal and a private browser window: each window
plays as its own player.

See [docs/architecture.md](docs/architecture.md) for the project structure.
