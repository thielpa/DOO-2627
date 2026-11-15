import type { EntityManager } from "@mikro-orm/postgresql";
import type { Transaction } from "../../application";

export class MikroOrmTransaction implements Transaction {
  constructor(private readonly em: EntityManager) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    // Repositories using the global EntityManager automatically join this transaction.
    return this.em.transactional(() => work());
  }
}
