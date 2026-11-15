import { DomainError } from "../shared/domain-error";

/** Public representation of a Player. Authentication data is deliberately excluded. */
export interface PlayerJson {
  id: string;
  username: string;
}

/** Aggregate root for a player's account identity and credential hash. */
export class Player {
  // Constructor is used by the factory and by persistence to rebuild a player.
  constructor(
    private readonly _id: string,
    private readonly _username: string,
    private readonly _passwordHash: string,
  ) {}

  static create(id: string, username: string, passwordHash: string): Player {
    if (id.length === 0) {
      throw new DomainError("CONFLICT", "Player ID cannot be empty");
    }
    if (username.length === 0) {
      throw new DomainError("CONFLICT", "Player username cannot be empty");
    }
    if (passwordHash.length === 0) {
      throw new DomainError("CONFLICT", "Player password hash cannot be empty");
    }

    return new Player(id, username, passwordHash);
  }

  get id(): string {
    return this._id;
  }

  get username(): string {
    return this._username;
  }

  /** Used by authentication application code; never included in the public JSON view. */
  get passwordHash(): string {
    return this._passwordHash;
  }

  toJSON(): PlayerJson {
    return { id: this._id, username: this._username };
  }
}
