import { Hono } from "hono";
import type { UseCases } from "../../application";

export const categoryRoutes = (useCases: UseCases) =>
  new Hono().get("/", async (c) => c.json(await useCases.listCategories.execute()));
