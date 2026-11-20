import { MikroORM } from "@mikro-orm/postgresql";
import { createUseCases } from "./application";
import { loadConfig } from "./config";
import type { MatchEvent } from "./domain";
import { createApp } from "./http/app";
import { InProcessEventDispatcher } from "./infrastructure/events/in-process-event-dispatcher";
import ormConfig from "./infrastructure/persistence/mikro-orm.config";
import { mikroOrmRepositories } from "./infrastructure/persistence/repositories";
import { withRequestContext } from "./infrastructure/persistence/request-context";
import { BunPasswordHasher } from "./infrastructure/security/bun-password-hasher";
import { startExpiryJob } from "./jobs/expiry-job";

const { port, turnTimeoutMs, expiryIntervalMs } = loadConfig();

// Composition root: build infrastructure, wire it into the application and HTTP layer.
const orm = await MikroORM.init(ormConfig);
const events = new InProcessEventDispatcher<MatchEvent>();
// Handlers of other contexts (notifications, gamification) subscribe here.
for (const type of ["TurnPassed", "MatchCompleted", "MatchExpired"] as const) {
  events.subscribe(type, (event) => console.info(`[event] ${type} match=${event.matchId}`));
}

const useCases = createUseCases(mikroOrmRepositories(orm.em), new BunPasswordHasher(), events, {
  turnTimeoutMs,
});
const aroundRequest = withRequestContext(orm);
const app = createApp({ useCases, aroundRequest, orm });
const stopExpiryJob = startExpiryJob({
  useCase: useCases.expireOverdueMatches,
  aroundRequest,
  intervalMs: expiryIntervalMs,
});

// Stop the job and close the database connection before exiting.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    stopExpiryJob();
    await orm.close();
    process.exit(0);
  });
}

export default {
  port,
  fetch: app.fetch,
};
