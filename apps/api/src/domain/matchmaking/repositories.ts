import type { FriendChallenge } from "./friend-challenge";
import type { GameMode } from "./game-mode";
import type { Lobby } from "./lobby";

export interface LobbyRepository {
  /**
   * Serializes matchmaking for a mode until the current unit of work ends, so concurrent
   * searches see each other's lobbies. Call it before reading any lobby.
   */
  lockMatchmaking(mode: GameMode): Promise<void>;
  byId(id: string): Promise<Lobby | null>;
  /** The oldest searching lobby someone else opened. */
  // TODO(specification): the rule "searching lobby of this mode, player not in it" is written in
  // MikroOrmLobbyRepository.findOpenFor, InMemoryLobbyRepository.findOpenFor and the guards of
  // Lobby.join. Extract it like OverdueMatch (docs/design.md, section 6.1).
  findOpenFor(mode: GameMode, excludingPlayerId: string): Promise<Lobby | null>;
  // TODO(specification): the rule "searching lobby the player is in" is written in
  // MikroOrmLobbyRepository.findSearchingBy and InMemoryLobbyRepository.findSearchingBy.
  // Extract it like OverdueMatch (docs/design.md, section 6.1).
  findSearchingBy(playerId: string): Promise<Lobby | null>;
  save(lobby: Lobby): Promise<void>;
}

export interface FriendChallengeRepository {
  byId(id: string): Promise<FriendChallenge | null>;
  /** Loads and locks the row for response changes; call inside Transaction.run. */
  byIdForUpdate(id: string): Promise<FriendChallenge | null>;
  pendingBetween(
    challengerPlayerId: string,
    challengedPlayerId: string,
  ): Promise<FriendChallenge | null>;
  pendingForChallenged(playerId: string): Promise<FriendChallenge[]>;
  forChallenger(playerId: string): Promise<FriendChallenge[]>;
  save(challenge: FriendChallenge): Promise<void>;
}
