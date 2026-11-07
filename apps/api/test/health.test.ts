import { describe, expect, it } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { createApp } from "../src/http/app";
import { healthRoutes } from "../src/http/routes/health";
import { inMemoryUseCases } from "./support/in-memory-repositories";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await createApp({ useCases: inMemoryUseCases() }).request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const orm = {
      em: { getConnection: () => ({ execute: () => Promise.reject(new Error("down")) }) },
    } as unknown as MikroORM;
    const res = await healthRoutes(orm).request("/");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "db-unavailable" });
  });
});
