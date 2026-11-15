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
    return handler ? Response.json(handler(init)) : new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderAt(path: string) {
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

it("lists my matches and sends the player id", async () => {
  const fetch = stubApi({ "GET /api/matches": () => [summary] });
  renderAt("/");

  expect(await screen.findByText("Your turn")).toBeInTheDocument();
  const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;
  expect(new Headers(headers).get("X-Player-Id")).toMatch(/^[0-9a-f-]{36}$/);
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
