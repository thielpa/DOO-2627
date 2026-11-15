import type { Player } from "./player";

export interface PlayerRepository {
  byId(id: string): Promise<Player | null>;
  byUsername(username: string): Promise<Player | null>;
  save(player: Player): Promise<void>;
}
