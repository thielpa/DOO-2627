import type { EntityManager } from "@mikro-orm/postgresql";
import { Category, type CategoryRepository } from "../../../domain";

export class MikroOrmCategoryRepository implements CategoryRepository {
  // The global EntityManager resolves to the current request/transaction fork on every call.
  constructor(private readonly em: EntityManager) {}

  all(): Promise<Category[]> {
    return this.em.find(Category, {}, { orderBy: { name: "asc" } });
  }
}
