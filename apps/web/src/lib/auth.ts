import { api, unwrap } from "./api";

const PLAYER_STORAGE_KEY = "languageduel.player";

export interface PlayerIdentity {
  id: string;
  username: string;
}

function isPlayerIdentity(value: unknown): value is PlayerIdentity {
  if (typeof value !== "object" || value === null) return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string" && typeof player.username === "string";
}

export function clearPlayerIdentity(): void {
  try {
    localStorage.removeItem(PLAYER_STORAGE_KEY);
  } catch {
    // The cache is optional; server session state remains authoritative.
  }
}

function cachePlayerIdentity(player: PlayerIdentity): void {
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
  } catch {
    // The cache is optional; server session state remains authoritative.
  }
}

export async function loginPlayer(username: string, password: string): Promise<PlayerIdentity> {
  const player = await unwrap(api.auth.login.$post({ json: { username, password } }));
  cachePlayerIdentity(player);
  return player;
}

/** Restores public identity from the server; local storage is only a display cache. */
export async function restorePlayerSession(): Promise<PlayerIdentity | null> {
  const response = await api.auth.me.$get();
  if (response.status === 401) {
    clearPlayerIdentity();
    return null;
  }
  if (!response.ok) {
    throw new Error(`Could not restore your session (HTTP ${response.status}). Please try again.`);
  }

  const player: unknown = await response.json();
  if (!isPlayerIdentity(player)) {
    throw new Error("The server returned an invalid session identity. Please try again.");
  }
  cachePlayerIdentity(player);
  return player;
}

export async function logoutPlayer(): Promise<void> {
  await unwrap(api.auth.logout.$post());
  clearPlayerIdentity();
}
