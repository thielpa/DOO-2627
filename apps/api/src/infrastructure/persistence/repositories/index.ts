import type { EntityManager } from "@mikro-orm/postgresql";
import type { Repositories } from "../../../application";
import { MikroOrmTransaction } from "../mikro-orm-transaction";
import { MikroOrmCategoryRepository } from "./mikro-orm-category.repository";
import { MikroOrmFriendChallengeRepository } from "./mikro-orm-friend-challenge.repository";
import { MikroOrmLobbyRepository } from "./mikro-orm-lobby.repository";
import { MikroOrmMatchRepository } from "./mikro-orm-match.repository";
import { MikroOrmNotificationRepository } from "./mikro-orm-notification.repository";
import { MikroOrmPlayerRepository } from "./mikro-orm-player.repository";
import { MikroOrmQuestionRepository } from "./mikro-orm-question.repository";
import { MikroOrmSessionRepository } from "./mikro-orm-session.repository";

export function mikroOrmRepositories(em: EntityManager): Repositories {
  return {
    categories: new MikroOrmCategoryRepository(em),
    questions: new MikroOrmQuestionRepository(em),
    lobbies: new MikroOrmLobbyRepository(em),
    matches: new MikroOrmMatchRepository(em),
    players: new MikroOrmPlayerRepository(em),
    sessions: new MikroOrmSessionRepository(em),
    friendChallenges: new MikroOrmFriendChallengeRepository(em),
    notifications: new MikroOrmNotificationRepository(em),
    transaction: new MikroOrmTransaction(em),
  };
}
