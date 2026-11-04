import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAppRouter } from "./router";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows the API status on the home page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "ok" })),
  );
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/"] }) });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("ok")).toBeInTheDocument();
});
