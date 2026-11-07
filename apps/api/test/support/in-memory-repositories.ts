import { createUseCases, type Repositories } from "../../src/application";
import type {
  Category,
  CategoryRepository,
  Difficulty,
  GameMode,
  Lobby,
  LobbyRepository,
  Match,
  MatchRepository,
  Question,
  QuestionRepository,
} from "../../src/domain";

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

  async forPlayer(playerId: string) {
    return [...this.matches.values()].filter((m) => m.isParticipant(playerId));
  }

  async save(match: Match) {
    this.matches.set(match.id, match);
  }
}

export function inMemoryUseCases(
  categories: Category[] = [],
  questions: Question[] = [],
  now: () => Date = () => new Date(),
) {
  const repositories: Repositories = {
    categories: new InMemoryCategoryRepository(categories),
    questions: new InMemoryQuestionRepository(questions),
    lobbies: new InMemoryLobbyRepository(),
    matches: new InMemoryMatchRepository(),
    transaction: { run: (work) => work() },
  };
  return createUseCases(repositories, now);
}
