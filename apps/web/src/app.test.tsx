import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MatchSummary, MatchView } from "./lib/api";
import { createAppRouter } from "./router";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Handler = (init?: RequestInit) => unknown;

/** Stubs fetch with responses per "METHOD /path" and records the requests. */
function stubApi(routes: Record<string, Handler>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const handler = routes[`${init?.method ?? "GET"} ${path}`];
    if (handler) {
      const value = handler(init);
      return value instanceof Response ? value : Response.json(value);
    }
    if ((init?.method ?? "GET") === "GET" && path === "/auth/me") {
      return Response.json({ id: "player-1", username: "alice" });
    }
    if ((init?.method ?? "GET") === "GET" && path === "/api/matches") return Response.json([]);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderAt(path: string, authenticated = true) {
  if (authenticated) {
    localStorage.setItem(
      "languageduel.player",
      JSON.stringify({ id: "player-1", username: "alice" }),
    );
  }
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const summary: MatchSummary = {
  id: "m1",
  status: "STARTED",
  startedAt: "2026-11-05T10:00:00.000Z",
  isYourTurn: true,
  yourScore: 2,
  opponentScore: 1,
  result: null,
};

const rounds: MatchView["rounds"] = [1, 2, 3].map((number) => ({
  number,
  status: number === 1 ? "STARTED" : "UPCOMING",
  categoryName: null,
  yourCorrectCount: null,
  opponentCorrectCount: null,
}));

const question = {
  id: "q1",
  text: 'What is "das Brot" in English?',
  timeLimitMs: 20_000,
  remainingMs: 20_000,
  options: [
    { id: "o1", text: "bread" },
    { id: "o2", text: "butter" },
  ],
};

it("lists my matches and sends session credentials without a player ID header", async () => {
  const fetch = stubApi({ "GET /api/matches": () => [summary] });
  renderAt("/");

  expect(await screen.findByText("Your turn")).toBeInTheDocument();
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("include");
  const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
  expect(headers.has("X-Player-Id")).toBe(false);
});

it("logs in or creates a player and sends credentials to the backend", async () => {
  let player: { id: string; username: string } | null = null;
  const fetch = stubApi({
    "GET /auth/me": () => player ? player : Response.json({ error: "Authentication required" }, { status: 401 }),
    "POST /auth/login": (init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ username: "new-player", password: "pass123" });
      player = { id: "player-2", username: "new-player" };
      return player;
    },
  });
  renderAt("/login", false);

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "new-player" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("new-player")).toBeInTheDocument();
  const loginCall = fetch.mock.calls.find(
    ([input, init]) => new URL(String(input), "http://localhost").pathname === "/auth/login" && init?.method === "POST",
  );
  expect(loginCall?.[1]?.credentials).toBe("include");
  expect(localStorage.getItem("languageduel.player")).toContain("new-player");
});

it("shows the backend's invalid-credentials error", async () => {
  stubApi({
    "GET /auth/me": () => Response.json({ error: "Authentication required" }, { status: 401 }),
    "POST /auth/login": () =>
      Response.json({ error: "Invalid username or password" }, { status: 401 }),
  });
  renderAt("/login", false);

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
});

it("restores identity from a valid cookie when local storage is empty", async () => {
  const fetch = stubApi({ "GET /auth/me": () => ({ id: "player-1", username: "alice" }) });
  renderAt("/", false);

  expect(await screen.findByText("alice")).toBeInTheDocument();
  expect(localStorage.getItem("languageduel.player")).toContain("alice");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/auth/me"),
    expect.objectContaining({ credentials: "include" }),
  );
});

it("clears expired local identity and redirects protected pages to login", async () => {
  stubApi({
    "GET /auth/me": () => Response.json({ error: "Authentication required" }, { status: 401 }),
  });
  renderAt("/matches/m1");

  expect(await screen.findByRole("heading", { name: "Welcome to Languageduel" })).toBeInTheDocument();
  expect(localStorage.getItem("languageduel.player")).toBeNull();
});

it("logs out through the backend and clears the displayed identity", async () => {
  let authenticated = true;
  const fetch = stubApi({
    "GET /auth/me": () => authenticated
      ? { id: "player-1", username: "alice" }
      : Response.json({ error: "Authentication required" }, { status: 401 }),
    "POST /auth/logout": () => {
      authenticated = false;
      return new Response(null, { status: 204 });
    },
  });
  renderAt("/");

  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

  expect(await screen.findByRole("heading", { name: "Welcome to Languageduel" })).toBeInTheDocument();
  expect(localStorage.getItem("languageduel.player")).toBeNull();
  const logoutCall = fetch.mock.calls.find(
    ([input, init]) => new URL(String(input), "http://localhost").pathname === "/auth/logout" && init?.method === "POST",
  );
  expect(logoutCall?.[1]?.credentials).toBe("include");
});

it("shows retry on session-check server errors without clearing cached identity", async () => {
  localStorage.setItem("languageduel.player", JSON.stringify({ id: "player-1", username: "alice" }));
  const fetch = vi.fn(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  renderAt("/");

  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't check your session");
  expect(localStorage.getItem("languageduel.player")).toContain("alice");
  expect(screen.queryByText("alice")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

it("lets the chooser pick a category", async () => {
  const fetch = stubApi({
    "GET /api/matches/m1": () => ({
      ...summary,
      rounds,
      current: {
        roundNumber: 1,
        isPlayerChooser: true,
        categories: [{ id: "food", name: "Food" }],
        hasQuestionToAnswer: false,
      },
    }),
    "POST /api/matches/m1/category": () => null,
  });
  renderAt("/matches/m1");

  fireEvent.click(await screen.findByRole("button", { name: "Food" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  await vi.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/matches/m1/category"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ categoryId: "food" }) }),
    ),
  );
});

it("reveals the correct answer after answering", async () => {
  const fetch = stubApi({
    "GET /api/matches/m1": () => ({
      ...summary,
      rounds,
      current: {
        roundNumber: 1,
        isPlayerChooser: true,
        categories: null,
        hasQuestionToAnswer: true,
      },
    }),
    "POST /api/matches/m1/questions/next": () => question,
    "POST /api/matches/m1/answers": () => ({ isCorrect: false, correctOptionId: "o1" }),
  });
  renderAt("/matches/m1");

  fireEvent.click(await screen.findByRole("button", { name: "butter" }));

  expect(await screen.findByText("Wrong")).toBeInTheDocument();
  // Only the choice is sent; the server measures the time needed.
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/matches/m1/answers"),
    expect.objectContaining({ body: JSON.stringify({ questionId: "q1", optionId: "o2" }) }),
  );
  expect(screen.getByText("bread")).toHaveClass("border-green-600");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("shows the scores while waiting for the opponent", async () => {
  stubApi({
    "GET /api/matches/m1": () => ({
      ...summary,
      isYourTurn: false,
      rounds,
      current: {
        roundNumber: 1,
        isPlayerChooser: true,
        categories: null,
        hasQuestionToAnswer: false,
      },
    }),
  });
  renderAt("/matches/m1");

  expect(await screen.findByText("Waiting for your opponent…")).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
});
