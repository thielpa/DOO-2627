import type { AppType } from "@languageduel/api";
import { type ClientResponse, hc, type InferResponseType } from "hono/client";

// Typed HTTP client. Session cookies authenticate API requests; identity comes from the backend session.
export const api = hc<AppType>("/", {
  init: { credentials: "include" },
});

export type MatchView = InferResponseType<(typeof api.api.matches)[":id"]["$get"], 200>;
export type MatchSummary = InferResponseType<typeof api.api.matches.$get, 200>[number];
export type QuestionView = InferResponseType<
  (typeof api.api.matches)[":id"]["questions"]["next"]["$post"],
  200
>;
export type AnswerResult = InferResponseType<
  (typeof api.api.matches)[":id"]["answers"]["$post"],
  200
>;

/** Resolves the JSON body of a successful response, throws the API's error message otherwise. */
export async function unwrap<T>(request: Promise<ClientResponse<T>>): Promise<T> {
  const response = await request;
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
