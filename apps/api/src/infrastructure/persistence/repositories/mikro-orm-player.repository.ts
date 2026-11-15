import type { EntityManager } from "@mikro-orm/postgresql";
import { Player, type PlayerRepository } from "../../../domain";

export class MikroOrmPlayerRepository implements PlayerRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<Player | null> {
    return this.em.findOne(Player, { _id: id } as object);
  }

  byUsername(username: string): Promise<Player | null> {
    return this.em.findOne(Player, { _username: username } as object);
  }

  async save(player: Player): Promise<void> {
    await this.em.persist(player).flush();
  }
}
