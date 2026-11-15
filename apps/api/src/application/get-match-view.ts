import {
  type CategoryRepository,
  DomainError,
  type Match,
  type MatchRepository,
  type ReadonlyRound,
  type RoundStatus,
} from "../domain";
import type { CategoryView } from "./list-categories";
import { type MatchSummary, summarize } from "./match-summary";

export interface RoundView {
  number: number;
  status: RoundStatus;
  categoryName: string | null;
  yourCorrectCount: number | null;
  opponentCorrectCount: number | null;
}

export interface CurrentRoundView {
  roundNumber: number;
  isPlayerChooser: boolean;
  categories: CategoryView[] | null;
  /** The player has a question to answer; it is revealed (and its clock starts) via ShowQuestion. */
  hasQuestionToAnswer: boolean;
}

export interface MatchView extends MatchSummary {
  rounds: RoundView[];
  current: CurrentRoundView | null;
}

export class GetMatchView {
  constructor(
    private readonly matches: MatchRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(matchId: string, playerId: string): Promise<MatchView> {
    const match = await this.matches.byId(matchId);
    if (!match) throw new DomainError("NOT_FOUND", "Match not found");
    match.assertParticipant(playerId);

    const categories = await this.categories.all();
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const opponentId = match.opponentOf(playerId);

    return {
      ...summarize(match, playerId),
      rounds: match.rounds.map((round) => roundView(round, playerId, opponentId, categoryNameById)),
      current: currentRoundView(match, playerId, categories),
    };
  }
}

function roundView(
  round: ReadonlyRound,
  playerId: string,
  opponentId: string,
  categoryNameById: Map<string, string>,
): RoundView {
  return {
    number: round.number,
    status: round.status,
    categoryName: categoryNameById.get(round.categoryId ?? "") ?? null,
    yourCorrectCount: round.hasCategory() ? round.correctCount(playerId) : null,
    opponentCorrectCount: round.visibleCorrectCountOf(opponentId, playerId),
  };
}

function currentRoundView(
  match: Match,
  playerId: string,
  categories: CategoryView[],
): CurrentRoundView | null {
  const round = match.currentRound();
  if (!round) return null;

  const isPlayerTurn = match.whoseTurn() === playerId;
  const needsCategory = isPlayerTurn && !round.hasCategory();

  return {
    roundNumber: round.number,
    isPlayerChooser: round.chooserId === playerId,
    categories: needsCategory ? categories.map(({ id, name }) => ({ id, name })) : null,
    hasQuestionToAnswer: isPlayerTurn && round.nextQuestionIdFor(playerId) !== null,
  };
}
