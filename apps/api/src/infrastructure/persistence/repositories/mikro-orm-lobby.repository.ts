import type { EntityManager } from "@mikro-orm/postgresql";
import { type GameMode, Lobby, type LobbyRepository } from "../../../domain";

// Queries use the mapped field names (`_status` etc.) because the domain keeps them private.
export class MikroOrmLobbyRepository implements LobbyRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<Lobby | null> {
    return this.em.findOne(Lobby, { _id: id } as object);
  }

  async lockMatchmaking(mode: GameMode): Promise<void> {
    // Transaction-scoped advisory lock: released automatically on commit or rollback.
    await this.em.execute("select pg_advisory_xact_lock(hashtext(?))", [`matchmaking:${mode}`]);
  }

  findOpenFor(mode: GameMode, excludingPlayerId: string): Promise<Lobby | null> {
    return this.em.findOne(
      Lobby,
      {
        _mode: mode,
        _status: "SEARCHING",
        $not: { _players: { $contains: [excludingPlayerId] } },
      } as object,
      // The player who has waited longest gets the opponent first.
      { orderBy: { _createdAt: "asc" } as object },
    );
  }

  findSearchingBy(playerId: string): Promise<Lobby | null> {
    return this.em.findOne(Lobby, {
      _status: "SEARCHING",
      _players: { $contains: [playerId] },
    } as object);
  }

  async save(lobby: Lobby): Promise<void> {
    await this.em.persist(lobby).flush();
  }
}
