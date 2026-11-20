import { beforeEach, describe, expect, it } from "bun:test";
import { SESSION_LIFETIME_MS } from "../src/application";
import { createApp } from "../src/http/app";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../src/http/session-cookie";
import { inMemoryUseCases } from "./support/in-memory-repositories";

let now: Date;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  now = new Date("2026-11-15T12:00:00Z");
  app = createApp({ useCases: inMemoryUseCases([], [], { now: () => now }).useCases });
});

function login(username: string, password: string, url = "/auth/login") {
  const origin = new URL(url, "http://localhost").origin;
  return app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ username, password }),
  });
}

function cookiePair(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected a session Set-Cookie header");
  return cookie;
}

describe("HTTP authentication", () => {
  it("creates an account, returns public identity, and sets a local session cookie", async () => {
    const response = await login("alice", "secret");
    const body = (await response.json()) as Record<string, unknown>;
    const setCookie = response.headers.get("set-cookie") ?? "";
    const rawToken = cookiePair(response).split("=")[1];

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: expect.any(String), username: "alice" });
    expect(Object.keys(body).sort()).toEqual(["id", "username"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Max-Age=604800/i);
    expect(setCookie).not.toMatch(/; Secure(?:;|$)/i);
    expect(JSON.stringify(body)).not.toContain(rawToken);
  });

  it("authenticates an existing username", async () => {
    const first = await login("alice", "secret");
    const firstBody = await first.json();
    const second = await login("alice", "secret");

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
  });

  it("uses a generic response for incorrect passwords", async () => {
    await login("alice", "secret");

    const response = await login("alice", "wrong-password");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid username or password" });
  });

  it("returns the public Player identity from a valid session cookie", async () => {
    const authenticated = await login("alice", "secret");
    const response = await app.request("/auth/me", {
      headers: { Cookie: cookiePair(authenticated) },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: expect.any(String), username: "alice" });
    expect(Object.keys(body).sort()).toEqual(["id", "username"]);
  });

  it("rejects missing, invalid, and expired sessions at /auth/me", async () => {
    expect((await app.request("/auth/me")).status).toBe(401);
    expect(
      (await app.request("/auth/me", { headers: { Cookie: `${SESSION_COOKIE_NAME}=invalid` } }))
        .status,
    ).toBe(401);

    const authenticated = await login("alice", "secret");
    now = new Date(now.getTime() + SESSION_LIFETIME_MS);
    expect(
      (await app.request("/auth/me", { headers: { Cookie: cookiePair(authenticated) } })).status,
    ).toBe(401);
  });

  it("validates login request bodies", async () => {
    const empty = await login("", "secret");
    const malformed = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ username: "alice" }),
    });

    expect(empty.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it("sets Secure for HTTPS and production, but not local HTTP", async () => {
    const httpsResponse = await login("secure-user", "secret", "https://localhost/auth/login");
    expect(httpsResponse.headers.get("set-cookie")).toMatch(/; Secure(?:;|$)/i);
    expect(sessionCookieOptions("http://localhost/auth/login", "production").secure).toBe(true);
    expect(sessionCookieOptions("http://localhost/auth/login", "development").secure).toBe(false);
  });

  it("invalidates the current session and clears the cookie on logout", async () => {
    const firstLogin = await login("alice", "secret");
    const firstCookie = cookiePair(firstLogin);
    const secondLogin = await login("alice", "secret");
    const secondCookie = cookiePair(secondLogin);

    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: firstCookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
    });
    const clearedCookie = logout.headers.get("set-cookie") ?? "";

    expect(logout.status).toBe(204);
    expect(clearedCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(clearedCookie).toMatch(/Max-Age=0/i);
    expect(clearedCookie).toMatch(/HttpOnly/i);
    expect(clearedCookie).toMatch(/SameSite=Lax/i);
    expect(clearedCookie).toMatch(/Path=\//i);
    expect((await app.request("/api/matches", { headers: { Cookie: firstCookie } })).status).toBe(
      401,
    );
    expect((await app.request("/api/matches", { headers: { Cookie: secondCookie } })).status).toBe(
      200,
    );
  });

  it("clears the cookie safely when logout has no valid session", async () => {
    const missing = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    });
    const response = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
        Cookie: `${SESSION_COOKIE_NAME}=invalid`,
      },
    });

    expect(missing.status).toBe(204);
    expect(missing.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("keeps health and category routes public", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
    expect((await app.request("/api/categories")).status).toBe(200);
  });

  it("rejects missing, invalid, and expired sessions on protected routes", async () => {
    expect((await app.request("/api/matches")).status).toBe(401);
    expect(
      (
        await app.request("/api/matches", {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=invalid` },
        })
      ).status,
    ).toBe(401);

    const authenticated = await login("alice", "secret");
    now = new Date(now.getTime() + SESSION_LIFETIME_MS);
    expect(
      (
        await app.request("/api/matches", {
          headers: { Cookie: cookiePair(authenticated) },
        })
      ).status,
    ).toBe(401);
  });

  it("uses the session identity and ignores X-Player-Id", async () => {
    const aliceLogin = await login("alice", "secret");
    const bobLogin = await login("bob", "secret");
    const aliceCookie = cookiePair(aliceLogin);
    const bob = (await bobLogin.json()) as { id: string };

    const first = await app.request("/api/matchmaking/search", {
      method: "POST",
      headers: {
        Cookie: aliceCookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
    });
    const replay = await app.request("/api/matchmaking/search", {
      method: "POST",
      headers: {
        Cookie: aliceCookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
        "X-Player-Id": bob.id,
      },
    });

    expect(await replay.json()).toEqual(await first.json());
  });

  it("applies Hono CSRF protection to cross-site form submissions", async () => {
    const response = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
    });

    expect(response.status).toBe(403);
  });

  it("accepts same-origin JSON unsafe requests", async () => {
    const response = await login("same-origin", "secret");

    expect(response.status).toBe(200);
  });

  it("rejects cross-origin JSON login and logout requests", async () => {
    const loginResponse = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ username: "alice", password: "secret" }),
    });
    const logoutResponse = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    });

    expect(loginResponse.status).toBe(403);
    expect(logoutResponse.status).toBe(403);
  });

  it("uses Referer when Origin is absent and rejects unsafe requests with neither", async () => {
    const sameOriginReferer = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "http://localhost/page" },
    });
    const noOriginProof = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    });
    const crossOriginReferer = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://attacker.example/page",
      },
    });

    expect(sameOriginReferer.status).toBe(204);
    expect(noOriginProof.status).toBe(403);
    expect(crossOriginReferer.status).toBe(403);
  });

  it("keeps same-origin form posts accepted while rejecting cross-origin forms", async () => {
    const sameOrigin = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost",
        "Sec-Fetch-Site": "same-origin",
      },
      body: "unused=true",
    });
    const crossOrigin = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: "unused=true",
    });

    expect(sameOrigin.status).toBe(204);
    expect(crossOrigin.status).toBe(403);
  });
});
