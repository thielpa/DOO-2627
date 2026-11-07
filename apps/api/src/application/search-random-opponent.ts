import { type GameMode, Lobby, type LobbyRepository, Match, type MatchRepository } from "../domain";
import type { Transaction } from "./transaction";

export type SearchResult =
  | { status: "searching"; lobbyId: string }
  | { status: "matched"; matchId: string };

const GAME_MODE: GameMode = "SOLO_RANDOM";

export class SearchRandomOpponent {
  constructor(
    private readonly lobbies: LobbyRepository,
    private readonly matches: MatchRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(playerId: string): Promise<SearchResult> {
    return this.transaction.run(async () => {
      // Lock first: otherwise two concurrent searches (even by the same player) could both
      // miss each other's lobby and both open a new one.
      await this.lobbies.lockMatchmaking(GAME_MODE);

      const ownLobby = await this.lobbies.findSearchingBy(playerId);
      if (ownLobby) return { status: "searching", lobbyId: ownLobby.id };

      const openLobby = await this.lobbies.findOpenFor(GAME_MODE, playerId);
      if (!openLobby) {
        const lobby = Lobby.open(crypto.randomUUID(), GAME_MODE, playerId, this.now());
        await this.lobbies.save(lobby);
        return { status: "searching", lobbyId: lobby.id };
      }

      openLobby.join(playerId);
      const [first, second] = openLobby.players as [string, string];
      const match = Match.create(crypto.randomUUID(), [first, second], GAME_MODE, "EASY");
      match.start(this.now());
      openLobby.start(match.id);
      await this.matches.save(match);
      await this.lobbies.save(openLobby);
      return { status: "matched", matchId: match.id };
    });
  }
}
