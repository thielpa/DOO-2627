import { createUseCases, type Repositories, type UseCaseOptions } from "../../src/application";
import type { PasswordHasher } from "../../src/application/password-hasher";
import type {
  Category,
  CategoryRepository,
  Difficulty,
  FriendChallenge,
  FriendChallengeRepository,
  GameMode,
  ListOptions,
  Lobby,
  LobbyRepository,
  Match,
  MatchEvent,
  MatchRepository,
  Notification,
  NotificationRepository,
  OverdueMatch,
  Player,
  PlayerRepository,
  Question,
  QuestionRepository,
  Session,
  SessionRepository,
} from "../../src/domain";
import { DomainError } from "../../src/domain";
import { InProcessEventDispatcher } from "../../src/infrastructure/events/in-process-event-dispatcher";

export class InMemoryCategoryRepository implements CategoryRepository {
  constructor(private readonly categories: Category[]) {}

  async all() {
    return [...this.categories];
  }
}

export class InMemoryQuestionRepository implements QuestionRepository {
  constructor(private readonly questions: Question[]) {}

  async pickRandom(
    categoryId: string,
    difficulty: Difficulty,
    count: number,
    excludingIds: readonly string[],
  ) {
    return this.questions
      .filter((q) => q.categoryId === categoryId && q.difficulty === difficulty)
      .filter((q) => !excludingIds.includes(q.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  async byIds(ids: string[]) {
    return this.questions.filter((q) => ids.includes(q.id));
  }
}

export class InMemoryLobbyRepository implements LobbyRepository {
  private readonly lobbies = new Map<string, Lobby>();

  // Tests run one request at a time, so there is nothing to serialize.
  async lockMatchmaking() {}

  async byId(id: string) {
    return this.lobbies.get(id) ?? null;
  }

  async findOpenFor(mode: GameMode, excludingPlayerId: string) {
    return (
      [...this.lobbies.values()].find(
        (l) => l.mode === mode && l.status === "SEARCHING" && !l.isParticipant(excludingPlayerId),
      ) ?? null
    );
  }

  async findSearchingBy(playerId: string) {
    return (
      [...this.lobbies.values()].find(
        (l) => l.status === "SEARCHING" && l.isParticipant(playerId),
      ) ?? null
    );
  }

  async save(lobby: Lobby) {
    this.lobbies.set(lobby.id, lobby);
  }
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, Match>();

  async byId(id: string) {
    return this.matches.get(id) ?? null;
  }

  // Tests run one request at a time, so there is nothing to lock.
  async byIdForUpdate(id: string) {
    return this.byId(id);
  }

  async forPlayer(playerId: string) {
    return [...this.matches.values()].filter((m) => m.isParticipant(playerId));
  }

  async findIdsSatisfying(spec: OverdueMatch) {
    return [...this.matches.values()].filter((m) => spec.isSatisfiedBy(m)).map((m) => m.id);
  }

  async save(match: Match) {
    this.matches.set(match.id, match);
  }
}

export class InMemoryPlayerRepository implements PlayerRepository {
  private readonly players = new Map<string, Player>();

  async byId(id: string) {
    return this.players.get(id) ?? null;
  }

  async byUsername(username: string) {
    const normalizedUsername = username.toLowerCase();
    return (
      [...this.players.values()].find(
        (player) => player.username.toLowerCase() === normalizedUsername,
      ) ?? null
    );
  }

  async save(player: Player) {
    const existing = await this.byUsername(player.username);
    if (existing && existing.id !== player.id) {
      throw new DomainError("CONFLICT", "A Player with this username already exists");
    }
    this.players.set(player.id, player);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async byTokenDigest(tokenDigest: string) {
    return this.sessions.get(tokenDigest) ?? null;
  }

  async save(session: Session) {
    this.sessions.set(session.tokenDigest, session);
  }
}

export class InMemoryFriendChallengeRepository implements FriendChallengeRepository {
  private readonly challenges = new Map<string, FriendChallenge>();

  async byId(id: string) {
    return this.challenges.get(id) ?? null;
  }

  async byIdForUpdate(id: string) {
    return this.byId(id);
  }

  async pendingBetween(challengerPlayerId: string, challengedPlayerId: string) {
    return (
      [...this.challenges.values()].find(
        (challenge) =>
          ((challenge.challengerPlayerId === challengerPlayerId &&
            challenge.challengedPlayerId === challengedPlayerId) ||
            (challenge.challengerPlayerId === challengedPlayerId &&
              challenge.challengedPlayerId === challengerPlayerId)) &&
          challenge.status === "PENDING",
      ) ?? null
    );
  }

  async pendingForChallenged(playerId: string) {
    return [...this.challenges.values()]
      .filter(
        (challenge) => challenge.challengedPlayerId === playerId && challenge.status === "PENDING",
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async forChallenger(playerId: string) {
    return [...this.challenges.values()]
      .filter((challenge) => challenge.challengerPlayerId === playerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async save(challenge: FriendChallenge) {
    this.challenges.set(challenge.id, challenge);
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<string, Notification>();

  async save(notification: Notification) {
    this.notifications.set(notification.id, notification);
  }

  async addIfAbsent(notification: Notification) {
    const exists = [...this.notifications.values()].some(
      (n) => n.eventId === notification.eventId && n.recipientId === notification.recipientId,
    );
    if (!exists) this.notifications.set(notification.id, notification);
    return !exists;
  }

  async byIdForRecipient(id: string, recipientId: string) {
    const found = this.notifications.get(id);
    return found && found.recipientId === recipientId ? found : null;
  }

  private visibleFor(recipientId: string) {
    return [...this.notifications.values()].filter(
      (n) => n.recipientId === recipientId && n.isVisibleInApp(),
    );
  }

  async listForRecipient(recipientId: string, { after, limit }: ListOptions) {
    const position = (n: Notification) => ({ at: n.visibleAt()?.getTime() ?? 0, id: n.id });
    const compare = (a: Notification, b: Notification) => {
      const pa = position(a);
      const pb = position(b);
      return pa.at - pb.at || (pa.id < pb.id ? -1 : pa.id > pb.id ? 1 : 0);
    };
    const matching = this.visibleFor(recipientId)
      .filter((n) => {
        if (!after) return true;
        const p = position(n);
        const t = after.visibleAt.getTime();
        return p.at > t || (p.at === t && p.id > after.id);
      })
      .sort(compare);
    // Incremental: the oldest `limit` after the cursor; initial: the newest `limit`. Newest first.
    const page = after ? matching.slice(0, limit) : matching.slice(-limit);
    return page.reverse();
  }

  async unreadCount(recipientId: string) {
    return this.visibleFor(recipientId).filter((n) => !n.readAt).length;
  }

  async claimPendingDeliveries(limit: number) {
    return [...this.notifications.values()]
      .flatMap((notification) =>
        notification.deliveries
          .filter((delivery) => delivery.status === "PENDING")
          .map((delivery) => ({ notification, delivery })),
      )
      .slice(0, limit);
  }
}

/** Use cases on in-memory repositories; `events` records every dispatched event. */
export function inMemoryUseCases(
  categories: Category[] = [],
  questions: Question[] = [],
  options: UseCaseOptions = {},
) {
  const matches = new InMemoryMatchRepository();
  const repositories: Repositories = {
    categories: new InMemoryCategoryRepository(categories),
    questions: new InMemoryQuestionRepository(questions),
    lobbies: new InMemoryLobbyRepository(),
    matches,
    players: new InMemoryPlayerRepository(),
    sessions: new InMemorySessionRepository(),
    friendChallenges: new InMemoryFriendChallengeRepository(),
    notifications: new InMemoryNotificationRepository(),
    transaction: { run: (work) => work() },
  };
  const passwordHasher: PasswordHasher = {
    hash: async (plaintext) => `test-hash:${plaintext}`,
    verify: async (plaintext, hash) => hash === `test-hash:${plaintext}`,
  };
  const dispatcher = new InProcessEventDispatcher<MatchEvent>();
  const events: MatchEvent[] = [];
  for (const type of ["TurnPassed", "MatchCompleted", "MatchExpired"] as const) {
    dispatcher.subscribe(type, (event) => {
      events.push(event);
    });
  }
  const useCases = createUseCases(repositories, passwordHasher, dispatcher, options);
  dispatcher.subscribe("TurnPassed", useCases.notificationEventHandlers.TurnPassed);
  dispatcher.subscribe("MatchCompleted", useCases.notificationEventHandlers.MatchCompleted);
  dispatcher.subscribe("MatchExpired", useCases.notificationEventHandlers.MatchExpired);
  return {
    useCases,
    matches,
    events,
  };
}
