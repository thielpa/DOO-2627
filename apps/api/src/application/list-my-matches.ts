import type { MatchRepository } from "../domain";
import { type MatchSummary, summarize } from "./match-summary";

export class ListMyMatches {
  constructor(private readonly matches: MatchRepository) {}

  async execute(playerId: string): Promise<MatchSummary[]> {
    const matches = await this.matches.forPlayer(playerId);
    return matches
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))
      .map((match) => summarize(match, playerId));
  }
}
