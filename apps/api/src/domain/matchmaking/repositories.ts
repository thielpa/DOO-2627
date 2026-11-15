import type { GameMode } from "./game-mode";
import type { Lobby } from "./lobby";
import type { FriendChallenge } from "./friend-challenge";

export interface LobbyRepository {
  /**
   * Serializes matchmaking for a mode until the current unit of work ends, so concurrent
   * searches see each other's lobbies. Call it before reading any lobby.
   */
  lockMatchmaking(mode: GameMode): Promise<void>;
  byId(id: string): Promise<Lobby | null>;
  /** The oldest searching lobby someone else opened. */
  findOpenFor(mode: GameMode, excludingPlayerId: string): Promise<Lobby | null>;
  findSearchingBy(playerId: string): Promise<Lobby | null>;
  save(lobby: Lobby): Promise<void>;
}

export interface FriendChallengeRepository {
  byId(id: string): Promise<FriendChallenge | null>;
  /** Loads and locks the row for response changes; call inside Transaction.run. */
  byIdForUpdate(id: string): Promise<FriendChallenge | null>;
  pendingBetween(challengerPlayerId: string, challengedPlayerId: string): Promise<FriendChallenge | null>;
  pendingForChallenged(playerId: string): Promise<FriendChallenge[]>;
  forChallenger(playerId: string): Promise<FriendChallenge[]>;
  save(challenge: FriendChallenge): Promise<void>;
}
