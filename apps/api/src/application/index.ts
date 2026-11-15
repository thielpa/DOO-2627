import type {
  CategoryRepository,
  FriendChallengeRepository,
  LobbyRepository,
  MatchRepository,
  PlayerRepository,
  QuestionRepository,
  SessionRepository,
} from "../domain";
import { AnswerQuestion } from "./answer-question";
import { AuthenticatePlayer } from "./authenticate-player";
import { AcceptFriendChallenge } from "./accept-friend-challenge";
import { CreateSession } from "./create-session";
import { DeclineFriendChallenge } from "./decline-friend-challenge";
import { InviteFriend } from "./invite-friend";
import { ChooseCategory } from "./choose-category";
import { GetLobby } from "./get-lobby";
import { GetMatchView } from "./get-match-view";
import { GetPlayerIdentity } from "./get-player-identity";
import { ListCategories } from "./list-categories";
import { ListFriendChallenges } from "./list-friend-challenges";
import { ListMyMatches } from "./list-my-matches";
import { InvalidateSession } from "./invalidate-session";
import { SearchRandomOpponent } from "./search-random-opponent";
import { ShowQuestion } from "./show-question";
import { ValidateSession } from "./validate-session";
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
export { SESSION_LIFETIME_MS } from "./create-session";
export type { CreatedSession } from "./create-session";
export type { ValidatedSession } from "./validate-session";
export type { AcceptedFriendChallenge } from "./accept-friend-challenge";
export type { FriendChallengeView } from "./friend-challenge-view";
export type { FriendChallengeLists } from "./list-friend-challenges";

export interface Repositories {
  categories: CategoryRepository;
  questions: QuestionRepository;
  lobbies: LobbyRepository;
  matches: MatchRepository;
  players: PlayerRepository;
  friendChallenges: FriendChallengeRepository;
  sessions: SessionRepository;
  transaction: Transaction;
}

export function createUseCases(
  {
    categories,
    questions,
    lobbies,
    matches,
    players,
    sessions,
    friendChallenges,
    transaction,
  }: Repositories,
  passwordHasher: PasswordHasher,
  now: () => Date = () => new Date(),
) {
  return {
    authenticatePlayer: new AuthenticatePlayer(players, passwordHasher),
    getPlayerIdentity: new GetPlayerIdentity(players),
    createSession: new CreateSession(sessions, now),
    validateSession: new ValidateSession(sessions, now),
    invalidateSession: new InvalidateSession(sessions, now),
    inviteFriend: new InviteFriend(players, friendChallenges, transaction, now),
    listFriendChallenges: new ListFriendChallenges(friendChallenges, players),
    acceptFriendChallenge: new AcceptFriendChallenge(
      friendChallenges,
      players,
      matches,
      transaction,
      now,
    ),
    declineFriendChallenge: new DeclineFriendChallenge(friendChallenges, players, transaction, now),
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
