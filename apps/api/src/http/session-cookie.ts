import { SESSION_LIFETIME_MS } from "../application";

export const SESSION_COOKIE_NAME = "quizduel_session";
export const SESSION_COOKIE_MAX_AGE = SESSION_LIFETIME_MS / 1_000;

export function sessionCookieOptions(requestUrl: string, nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
    secure: nodeEnv === "production" || new URL(requestUrl).protocol === "https:",
  };
}
