import { MikroORM } from "@mikro-orm/postgresql";
import { createUseCases } from "./application";
import { createApp } from "./http/app";
import config from "./infrastructure/persistence/mikro-orm.config";
import { mikroOrmRepositories } from "./infrastructure/persistence/repositories";
import { withRequestContext } from "./infrastructure/persistence/request-context";

// Composition root: build infrastructure, wire it into the application and HTTP layer.
const orm = await MikroORM.init(config);
const useCases = createUseCases(mikroOrmRepositories(orm.em));
const app = createApp({ useCases, aroundRequest: withRequestContext(orm), orm });

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
