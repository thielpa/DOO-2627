import type { EntityManager } from "@mikro-orm/postgresql";
import { Session, type SessionRepository } from "../../../domain";

export class MikroOrmSessionRepository implements SessionRepository {
  constructor(private readonly em: EntityManager) {}

  byTokenDigest(tokenDigest: string): Promise<Session | null> {
    return this.em.findOne(Session, { _tokenDigest: tokenDigest } as object);
  }

  async save(session: Session): Promise<void> {
    await this.em.persist(session).flush();
  }
}
