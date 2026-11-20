import { DomainError } from "../shared/domain-error";

export type FriendChallengeStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface FriendChallengeJson {
  id: string;
  challengerPlayerId: string;
  challengedPlayerId: string;
  status: FriendChallengeStatus;
  createdAt: Date;
  respondedAt: Date | null;
}

/** Invitation to start an asynchronous SOLO_FRIEND match with another Player. */
export class FriendChallenge {
  // Public for MikroORM hydration; application code should use create and lifecycle methods.
  constructor(
    private readonly _id: string,
    private readonly _challengerPlayerId: string,
    private readonly _challengedPlayerId: string,
    private _status: FriendChallengeStatus,
    private readonly _createdAt: Date,
    private _respondedAt: Date | null = null,
  ) {}

  static create(
    id: string,
    challengerPlayerId: string,
    challengedPlayerId: string,
    createdAt: Date,
  ): FriendChallenge {
    if (!id) throw new DomainError("CONFLICT", "Challenge ID cannot be empty");
    if (!challengerPlayerId || !challengedPlayerId) {
      throw new DomainError("CONFLICT", "Challenge Players are required");
    }
    if (challengerPlayerId === challengedPlayerId) {
      throw new DomainError("CONFLICT", "A Player cannot challenge themselves");
    }
    if (!Number.isFinite(createdAt.getTime())) {
      throw new DomainError("CONFLICT", "Challenge creation time must be a valid date");
    }

    return new FriendChallenge(id, challengerPlayerId, challengedPlayerId, "PENDING", createdAt);
  }

  get id(): string {
    return this._id;
  }

  get challengerPlayerId(): string {
    return this._challengerPlayerId;
  }

  get challengedPlayerId(): string {
    return this._challengedPlayerId;
  }

  get status(): FriendChallengeStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get respondedAt(): Date | null {
    return this._respondedAt;
  }

  accept(at: Date): void {
    this.respond("ACCEPTED", at);
  }

  decline(at: Date): void {
    this.respond("DECLINED", at);
  }

  toJSON(): FriendChallengeJson {
    return {
      id: this._id,
      challengerPlayerId: this._challengerPlayerId,
      challengedPlayerId: this._challengedPlayerId,
      status: this._status,
      createdAt: this._createdAt,
      respondedAt: this._respondedAt,
    };
  }

  private respond(status: "ACCEPTED" | "DECLINED", at: Date): void {
    if (this._status !== "PENDING") {
      throw new DomainError("CONFLICT", "Challenge has already been resolved");
    }
    if (!Number.isFinite(at.getTime()) || at.getTime() < this._createdAt.getTime()) {
      throw new DomainError(
        "CONFLICT",
        "Challenge response time must be valid and not precede creation",
      );
    }
    this._status = status;
    this._respondedAt = at;
  }
}
