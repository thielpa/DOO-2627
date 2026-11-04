import { describe, expect, it } from "bun:test";
import { createApp } from "../src/http/app";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await createApp().request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
