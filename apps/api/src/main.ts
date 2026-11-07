import { MikroORM } from "@mikro-orm/postgresql";
import { createApp } from "./http/app";
import config from "./infrastructure/persistence/mikro-orm.config";

// Composition root: build infrastructure, wire it into the application and HTTP layer.
const orm = await MikroORM.init(config);
const app = createApp({ orm });

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
