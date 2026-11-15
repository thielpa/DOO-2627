import { DomainError } from "../shared/domain-error";

export interface SessionJson {
  id: string;
  playerId: string;
  expiresAt: Date;
  invalidatedAt: Date | null;
}

/** A database-backed login session. Only the digest of its bearer token is retained. */
export class Session {
  // Public for MikroORM hydration; callers should use the validated factory.
  constructor(
    private readonly _id: string,
    private readonly _playerId: string,
    private readonly _tokenDigest: string,
    private readonly _expiresAt: Date,
    private _invalidatedAt: Date | null,
  ) {}

  static create(id: string, playerId: string, tokenDigest: string, expiresAt: Date): Session {
    if (id.length === 0) throw new DomainError("CONFLICT", "Session ID cannot be empty");
    if (playerId.length === 0) throw new DomainError("CONFLICT", "Session player ID cannot be empty");
    if (!/^[0-9a-f]{64}$/i.test(tokenDigest)) {
      throw new DomainError("CONFLICT", "Session token digest must be a SHA-256 hex digest");
    }
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new DomainError("CONFLICT", "Session expiry must be a valid date");
    }

    return new Session(id, playerId, tokenDigest, expiresAt, null);
  }

  get id(): string {
    return this._id;
  }

  get playerId(): string {
    return this._playerId;
  }

  /** Sensitive credential material for persistence and lookup; omit from public representations. */
  get tokenDigest(): string {
    return this._tokenDigest;
  }

  get expiresAt(): Date {
    return this._expiresAt;
  }

  get invalidatedAt(): Date | null {
    return this._invalidatedAt;
  }

  isValidAt(at: Date): boolean {
    return (
      Number.isFinite(at.getTime()) &&
      this._invalidatedAt === null &&
      this._expiresAt.getTime() > at.getTime()
    );
  }

  invalidate(at: Date): void {
    if (!Number.isFinite(at.getTime())) {
      throw new DomainError("CONFLICT", "Session invalidation time must be a valid date");
    }
    if (this._invalidatedAt !== null) {
      throw new DomainError("CONFLICT", "Session is already invalidated");
    }
    this._invalidatedAt = at;
  }

  toJSON(): SessionJson {
    return {
      id: this._id,
      playerId: this._playerId,
      expiresAt: this._expiresAt,
      invalidatedAt: this._invalidatedAt,
    };
  }
}
