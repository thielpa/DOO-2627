import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import { schemas } from "./schemas";

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: schemas,
  discovery: { warnWhenNoEntities: false },
  extensions: [Migrator],
  migrations: {
    path: "./src/infrastructure/persistence/migrations",
  },
});
