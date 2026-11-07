const STORAGE_KEY = "languageduel.playerId";

// Placeholder identity until Account/Profile exists: every browser plays as its own player.
// Replace this with the logged-in player once login is implemented.
export function getPlayerId(): string {
  let playerId = localStorage.getItem(STORAGE_KEY);
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, playerId);
  }
  return playerId;
}
