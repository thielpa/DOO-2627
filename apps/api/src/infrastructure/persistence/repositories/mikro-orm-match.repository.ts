import type { EntityManager } from "@mikro-orm/postgresql";
import { Match, type MatchRepository } from "../../../domain";

// Queries use the mapped field names (`_players` etc.) because the domain keeps them private.
export class MikroOrmMatchRepository implements MatchRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<Match | null> {
    return this.em.findOne(Match, { _id: id } as object);
  }

  forPlayer(playerId: string): Promise<Match[]> {
    return this.em.find(Match, { _players: { $contains: [playerId] } } as object);
  }

  async save(match: Match): Promise<void> {
    await this.em.persist(match).flush();
  }
}
