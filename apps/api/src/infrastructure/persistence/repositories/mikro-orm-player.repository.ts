import { raw, UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Player, type PlayerRepository } from "../../../domain";
import { DomainError } from "../../../domain/shared/domain-error";

export const PLAYER_USERNAME_UNIQUE_INDEX = "player_username_lower_unique";

export class MikroOrmPlayerRepository implements PlayerRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<Player | null> {
    return this.em.findOne(Player, { _id: id } as object);
  }

  byUsername(username: string): Promise<Player | null> {
    return this.em.findOne(Player, {
      [raw((alias) => `lower(${alias}."username")`)]: raw("lower(?)", [username]),
    } as object);
  }

  async save(player: Player): Promise<void> {
    try {
      await this.em.persist(player).flush();
    } catch (error) {
      if (
        error instanceof UniqueConstraintViolationException &&
        (error as UniqueConstraintViolationException & { constraint?: unknown }).constraint ===
          PLAYER_USERNAME_UNIQUE_INDEX
      ) {
        throw new DomainError("CONFLICT", "A Player with this username already exists");
      }
      throw error;
    }
  }
}
