import {
  type CategoryRepository,
  DEFAULT_TURN_TIMEOUT_MS,
  type FriendChallengeRepository,
  type LobbyRepository,
  type MatchRepository,
  type PlayerRepository,
  type QuestionRepository,
  type SessionRepository,
} from "../domain";
import { AcceptFriendChallenge } from "./accept-friend-challenge";
import { AnswerQuestion } from "./answer-question";
import { AuthenticatePlayer } from "./authenticate-player";
import { ChooseCategory } from "./choose-category";
import { CreateSession } from "./create-session";
import { DeclineFriendChallenge } from "./decline-friend-challenge";
import type { EventDispatcher } from "./event-dispatcher";
import { ExpireOverdueMatches } from "./expire-overdue-matches";
import { GetLobby } from "./get-lobby";
import { GetMatchView } from "./get-match-view";
import { GetPlayerIdentity } from "./get-player-identity";
import { InvalidateSession } from "./invalidate-session";
import { InviteFriend } from "./invite-friend";
import { ListCategories } from "./list-categories";
import { ListFriendChallenges } from "./list-friend-challenges";
import { ListMyMatches } from "./list-my-matches";
import type { PasswordHasher } from "./password-hasher";
import { SearchRandomOpponent } from "./search-random-opponent";
import { ShowQuestion } from "./show-question";
import type { Transaction } from "./transaction";
import { ValidateSession } from "./validate-session";

export type { AcceptedFriendChallenge } from "./accept-friend-challenge";
export type { AnswerResult } from "./answer-question";
export type { AuthenticatedPlayer, AuthenticatePlayerInput } from "./authenticate-player";
export { AuthenticationError } from "./authenticate-player";
export type { CreatedSession } from "./create-session";
export { SESSION_LIFETIME_MS } from "./create-session";
export type { EventDispatcher } from "./event-dispatcher";
export type { FriendChallengeView } from "./friend-challenge-view";
export type { LobbyView } from "./get-lobby";
export type { CurrentRoundView, MatchView, RoundView } from "./get-match-view";
export type { CategoryView } from "./list-categories";
export type { FriendChallengeLists } from "./list-friend-challenges";
export type { MatchResult, MatchSummary } from "./match-summary";
export type { PasswordHasher } from "./password-hasher";
export type { SearchResult } from "./search-random-opponent";
export type { QuestionView } from "./show-question";
export type { Transaction } from "./transaction";
export type { ValidatedSession } from "./validate-session";

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

export interface UseCaseOptions {
  now?: () => Date;
  /** How long a player has for their turn before they lose the match. */
  turnTimeoutMs?: number;
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
  events: EventDispatcher,
  { now = () => new Date(), turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS }: UseCaseOptions = {},
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
      turnTimeoutMs,
    ),
    declineFriendChallenge: new DeclineFriendChallenge(friendChallenges, players, transaction, now),
    searchRandomOpponent: new SearchRandomOpponent(
      lobbies,
      matches,
      transaction,
      now,
      turnTimeoutMs,
    ),
    getLobby: new GetLobby(lobbies),
    listCategories: new ListCategories(categories),
    listMyMatches: new ListMyMatches(matches),
    getMatchView: new GetMatchView(matches, categories),
    chooseCategory: new ChooseCategory(matches, questions, transaction, now),
    showQuestion: new ShowQuestion(matches, questions, transaction, now),
    answerQuestion: new AnswerQuestion(matches, questions, transaction, events, now),
    expireOverdueMatches: new ExpireOverdueMatches(matches, transaction, events, now),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
