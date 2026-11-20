import type { PlayerRepository } from "../domain";

export interface PlayerIdentity {
  id: string;
  username: string;
}

/** Returns only the public identity fields needed by authenticated HTTP clients. */
export class GetPlayerIdentity {
  constructor(private readonly players: PlayerRepository) {}

  async execute(playerId: string): Promise<PlayerIdentity | null> {
    const player = await this.players.byId(playerId);
    return player ? { id: player.id, username: player.username } : null;
  }
}
