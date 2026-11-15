import { DomainError } from "../shared/domain-error";
import type { GameMode } from "./game-mode";

export type LobbyStatus = "SEARCHING" | "READY" | "STARTED";

const PLAYERS_PER_LOBBY = 2;
// Lobbies for friends, teams and tournaments need invitations and teams, which don't exist yet.
const SUPPORTED_MODES: readonly GameMode[] = ["SOLO_RANDOM"];

/** Aggregate of the Matchmaking context: players waiting to be paired for a match. */
export class Lobby {
  // Constructor is used by the factory and by persistence to rebuild a lobby.
  constructor(
    private readonly _id: string,
    private readonly _mode: GameMode,
    private _status: LobbyStatus,
    private readonly _players: string[],
    private readonly _createdAt: Date,
    private _matchId: string | null = null,
  ) {}

  static open(id: string, mode: GameMode, playerId: string, now: Date): Lobby {
    if (!SUPPORTED_MODES.includes(mode)) {
      throw new DomainError("NOT_ALLOWED", `Game mode ${mode} is not supported yet`);
    }
    return new Lobby(id, mode, "SEARCHING", [playerId], now);
  }

  get id(): string {
    return this._id;
  }

  get mode(): GameMode {
    return this._mode;
  }

  get status(): LobbyStatus {
    return this._status;
  }

  get players(): readonly string[] {
    return this._players;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  /** The match this lobby started, once it is STARTED. */
  get matchId(): string | null {
    return this._matchId;
  }

  isParticipant(playerId: string): boolean {
    return this._players.includes(playerId);
  }

  join(playerId: string): void {
    if (this._status !== "SEARCHING") {
      throw new DomainError("CONFLICT", "Lobby is not searching for players");
    }
    if (this.isParticipant(playerId)) {
      throw new DomainError("CONFLICT", "Player is already in this lobby");
    }
    this._players.push(playerId);
    if (this._players.length === PLAYERS_PER_LOBBY) {
      this._status = "READY";
    }
  }

  start(matchId: string): void {
    if (this._status !== "READY") {
      throw new DomainError("CONFLICT", "Only a ready lobby can start a match");
    }
    this._matchId = matchId;
    this._status = "STARTED";
  }
}
