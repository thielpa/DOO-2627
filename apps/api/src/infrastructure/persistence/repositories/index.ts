import type { EntityManager } from "@mikro-orm/postgresql";
import type { Repositories } from "../../../application";
import { MikroOrmTransaction } from "../mikro-orm-transaction";
import { MikroOrmCategoryRepository } from "./mikro-orm-category.repository";
import { MikroOrmLobbyRepository } from "./mikro-orm-lobby.repository";
import { MikroOrmMatchRepository } from "./mikro-orm-match.repository";
import { MikroOrmQuestionRepository } from "./mikro-orm-question.repository";

export function mikroOrmRepositories(em: EntityManager): Repositories {
  return {
    categories: new MikroOrmCategoryRepository(em),
    questions: new MikroOrmQuestionRepository(em),
    lobbies: new MikroOrmLobbyRepository(em),
    matches: new MikroOrmMatchRepository(em),
    transaction: new MikroOrmTransaction(em),
  };
}
