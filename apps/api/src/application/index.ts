import type {
  CategoryRepository,
  LobbyRepository,
  MatchRepository,
  PlayerRepository,
  QuestionRepository,
} from "../domain";
import { AnswerQuestion } from "./answer-question";
import { AuthenticatePlayer } from "./authenticate-player";
import { ChooseCategory } from "./choose-category";
import { GetLobby } from "./get-lobby";
import { GetMatchView } from "./get-match-view";
import { ListCategories } from "./list-categories";
import { ListMyMatches } from "./list-my-matches";
import { SearchRandomOpponent } from "./search-random-opponent";
import { ShowQuestion } from "./show-question";
import type { Transaction } from "./transaction";
import type { PasswordHasher } from "./password-hasher";

export type { AnswerResult } from "./answer-question";
export { AuthenticationError } from "./authenticate-player";
export type { AuthenticatedPlayer, AuthenticatePlayerInput } from "./authenticate-player";
export type { LobbyView } from "./get-lobby";
export type { CurrentRoundView, MatchView, RoundView } from "./get-match-view";
export type { CategoryView } from "./list-categories";
export type { MatchResult, MatchSummary } from "./match-summary";
export type { SearchResult } from "./search-random-opponent";
export type { QuestionView } from "./show-question";
export type { Transaction } from "./transaction";
export type { PasswordHasher } from "./password-hasher";

export interface Repositories {
  categories: CategoryRepository;
  questions: QuestionRepository;
  lobbies: LobbyRepository;
  matches: MatchRepository;
  players: PlayerRepository;
  transaction: Transaction;
}

export function createUseCases(
  { categories, questions, lobbies, matches, players, transaction }: Repositories,
  passwordHasher: PasswordHasher,
  now: () => Date = () => new Date(),
) {
  return {
    authenticatePlayer: new AuthenticatePlayer(players, passwordHasher),
    searchRandomOpponent: new SearchRandomOpponent(lobbies, matches, transaction, now),
    getLobby: new GetLobby(lobbies),
    listCategories: new ListCategories(categories),
    listMyMatches: new ListMyMatches(matches),
    getMatchView: new GetMatchView(matches, categories),
    chooseCategory: new ChooseCategory(matches, questions, transaction),
    showQuestion: new ShowQuestion(matches, questions, transaction, now),
    answerQuestion: new AnswerQuestion(matches, questions, transaction, now),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
