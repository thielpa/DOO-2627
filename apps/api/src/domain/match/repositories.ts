import type { Match } from "./match";

export interface MatchRepository {
  byId(id: string): Promise<Match | null>;
  forPlayer(playerId: string): Promise<Match[]>;
  save(match: Match): Promise<void>;
}
