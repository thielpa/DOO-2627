const HOUR_MS = 60 * 60 * 1000;
// turn_timeout_ms is an int column.
const MAX_TURN_TIMEOUT_MS = 2 ** 31 - 1;

type Env = Record<string, string | undefined>;

export interface AppConfig {
  port: number;
  /** How long a player has for their turn before they lose the match. */
  turnTimeoutMs: number;
  /** How often the expiry job looks for overdue matches. */
  expiryIntervalMs: number;
}

/** Reads the settings from the environment; refuses to start on invalid values. */
export function loadConfig(env: Env = process.env): AppConfig {
  const turnTimeoutMs = Math.round(positiveNumber(env, "TURN_DEADLINE_HOURS", 24) * HOUR_MS);
  if (turnTimeoutMs > MAX_TURN_TIMEOUT_MS) {
    throw new Error(`TURN_DEADLINE_HOURS must be at most ${MAX_TURN_TIMEOUT_MS / HOUR_MS} hours`);
  }
  return {
    port: positiveNumber(env, "PORT", 3000),
    turnTimeoutMs,
    expiryIntervalMs: positiveNumber(env, "EXPIRY_INTERVAL_SECONDS", 60) * 1000,
  };
}

function positiveNumber(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}
