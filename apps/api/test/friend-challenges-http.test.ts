import { describe, expect, it } from "bun:test";
import { createApp } from "../src/http/app";
import { inMemoryUseCases } from "./support/in-memory-repositories";

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  if (!value) throw new Error("Expected a session cookie");
  return value;
}

describe("friend challenge HTTP routes", () => {
  it("uses session identity for invite and exposes public challenge data", async () => {
    const app = createApp({ useCases: inMemoryUseCases().useCases });
    const login = async (username: string) =>
      app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ username, password: "secret" }),
      });

    const aliceLogin = await login("alice");
    const bobLogin = await login("bob");
    const aliceCookie = cookieFrom(aliceLogin);
    const bobCookie = cookieFrom(bobLogin);
    const alice = (await aliceLogin.json()) as { id: string };
    const bob = (await bobLogin.json()) as { id: string };

    const invite = await app.request("/api/friend-challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        Cookie: aliceCookie,
        "X-Player-Id": bob.id,
      },
      body: JSON.stringify({ username: "bob" }),
    });
    expect(invite.status).toBe(201);
    const challenge = (await invite.json()) as Record<string, unknown>;
    expect(challenge).toMatchObject({
      challengerPlayerId: alice.id,
      challengedPlayerId: bob.id,
      status: "PENDING",
    });
    expect(JSON.stringify(challenge)).not.toContain("passwordHash");
    expect(JSON.stringify(challenge)).not.toContain("tokenDigest");

    const list = await app.request("/api/friend-challenges", {
      headers: { Cookie: bobCookie },
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ incoming: [{ id: challenge.id }] });
  });

  it("requires a session and validates invite body and challenge IDs", async () => {
    const app = createApp({ useCases: inMemoryUseCases().useCases });
    expect((await app.request("/api/friend-challenges")).status).toBe(401);

    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ username: "alice", password: "secret" }),
    });
    const cookie = cookieFrom(login);

    const invalidBody = await app.request("/api/friend-challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookie },
      body: JSON.stringify({ username: "" }),
    });
    expect(invalidBody.status).toBe(400);

    const invalidId = await app.request("/api/friend-challenges/not-a-uuid/accept", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: cookie },
    });
    expect(invalidId.status).toBe(400);
  });
});
