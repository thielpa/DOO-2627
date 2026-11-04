import type { AppType } from "@languageduel/api";
import { hc } from "hono/client";

// Typed HTTP client for the backend. The web app talks to the domain only through this API.
export const api = hc<AppType>("/");
