import type { SessionRepository } from "../domain";
import { digestSessionToken } from "./session-token";

export interface ValidatedSession {
  sessionId: string;
  playerId: string;
}

/** Returns null for unknown, expired, or invalidated tokens. */
export class ValidateSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly now: () => Date,
  ) {}

  async execute(token: string): Promise<ValidatedSession | null> {
    const session = await this.sessions.byTokenDigest(await digestSessionToken(token));
    if (!session || !session.isValidAt(this.now())) return null;
    return { sessionId: session.id, playerId: session.playerId };
  }
}
