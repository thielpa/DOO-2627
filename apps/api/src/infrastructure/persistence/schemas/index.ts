import type { EntitySchema } from "@mikro-orm/core";

// Register an EntitySchema here for every domain class that gets persisted.
// The mapping lives in this layer so the domain classes stay free of ORM code.
export const schemas: EntitySchema[] = [];
