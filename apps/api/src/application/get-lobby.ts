import { DomainError, type LobbyRepository, type LobbyStatus } from "../domain";

export interface LobbyView {
  id: string;
  status: LobbyStatus;
  matchId: string | null;
}

export class GetLobby {
  constructor(private readonly lobbies: LobbyRepository) {}

  async execute(lobbyId: string, playerId: string): Promise<LobbyView> {
    const lobby = await this.lobbies.byId(lobbyId);
    if (!lobby) throw new DomainError("NOT_FOUND", "Lobby not found");
    if (!lobby.isParticipant(playerId)) {
      throw new DomainError("NOT_ALLOWED", "Player is not part of this lobby");
    }
    return { id: lobby.id, status: lobby.status, matchId: lobby.matchId };
  }
}
