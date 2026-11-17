import { RequestContext } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { createUseCases } from "./application";
import { createApp } from "./http/app";
import config from "./infrastructure/persistence/mikro-orm.config";
import { mikroOrmRepositories } from "./infrastructure/persistence/repositories";
import { withRequestContext } from "./infrastructure/persistence/request-context";
import { BunPasswordHasher } from "./infrastructure/security/bun-password-hasher";

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const relayIntervalMs = positiveIntFromEnv("NOTIFICATION_RELAY_INTERVAL_MS", 1000);
const maxAttempts = positiveIntFromEnv("NOTIFICATION_MAX_ATTEMPTS", 5);

// Composition root: build infrastructure, wire it into the application and HTTP layer.
const orm = await MikroORM.init(config);
const useCases = createUseCases(
  mikroOrmRepositories(orm.em),
  new BunPasswordHasher(),
  () => new Date(),
  { maxAttempts },
);
const app = createApp({ useCases, aroundRequest: withRequestContext(orm), orm });

// Polling publisher (transactional outbox relay): every cycle runs in its own EntityManager
// context, like a request, and never overlaps with the previous cycle.
let relaying = false;
setInterval(async () => {
  if (relaying) return;
  relaying = true;
  try {
    await RequestContext.create(orm.em, () => useCases.relayPendingDeliveries.execute());
  } catch (error) {
    console.error("Notification relay cycle failed", error);
  } finally {
    relaying = false;
  }
}, relayIntervalMs);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
