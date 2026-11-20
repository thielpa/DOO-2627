import { type EntityManager, LockMode } from "@mikro-orm/postgresql";
import { Match, type MatchRepository, type OverdueMatch } from "../../../domain";

// Queries use the mapped field names (`_players` etc.) because the domain keeps them private.
export class MikroOrmMatchRepository implements MatchRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<Match | null> {
    return this.em.findOne(Match, { _id: id } as object);
  }

  byIdForUpdate(id: string): Promise<Match | null> {
    // SELECT ... FOR UPDATE: the row stays locked until the surrounding transaction ends.
    // `refresh` makes sure the locked row's current state is used, not an earlier loaded copy.
    return this.em.findOne(Match, { _id: id } as object, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    });
  }

  forPlayer(playerId: string): Promise<Match[]> {
    return this.em.find(Match, { _players: { $contains: [playerId] } } as object);
  }

  async findIdsSatisfying(spec: OverdueMatch): Promise<string[]> {
    // Translates OverdueMatch.isSatisfiedBy into SQL; a NULL deadline never matches `<=`.
    // Raw rows instead of entities: partially loaded matches must not end up in the identity map.
    const rows = await this.em
      .createQueryBuilder(Match)
      .select("_id" as never)
      .where({ _status: spec.status, _turnDeadline: { $lte: spec.now } } as object)
      .execute<{ id: string }[]>("all", false);
    return rows.map((row) => row.id);
  }

  async save(match: Match): Promise<void> {
    await this.em.persist(match).flush();
  }
}
