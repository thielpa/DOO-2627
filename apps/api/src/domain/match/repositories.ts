import type { Match } from "./match";
import type { OverdueMatch } from "./overdue-match";

export interface MatchRepository {
  byId(id: string): Promise<Match | null>;
  /**
   * Only call it inside a transaction.
   */
  byIdForUpdate(id: string): Promise<Match | null>;
  forPlayer(playerId: string): Promise<Match[]>;
  findIdsSatisfying(spec: OverdueMatch): Promise<string[]>;
  save(match: Match): Promise<void>;
}
