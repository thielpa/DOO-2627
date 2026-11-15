import { RequestContext } from "@mikro-orm/core";
import type { MikroORM } from "@mikro-orm/postgresql";

/** Gives every request its own EntityManager fork (Unit of Work / Identity Map). */
export function withRequestContext(orm: MikroORM) {
  return (next: () => Promise<void>) => RequestContext.create(orm.em, next);
}
