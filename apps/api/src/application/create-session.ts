import { Session, type SessionRepository } from "../domain";
import { digestSessionToken, generateSessionToken } from "./session-token";

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CreatedSession {
  /** Raw bearer token for a future HttpOnly Set-Cookie header; never serialize as JSON. */
  token: string;
  expiresAt: Date;
}

/** Creates a seven-day session, persisting only the digest of its raw bearer token. */
export class CreateSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly now: () => Date,
  ) {}

  async execute(playerId: string): Promise<CreatedSession> {
    const token = generateSessionToken();
    const tokenDigest = await digestSessionToken(token);
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
    const session = Session.create(crypto.randomUUID(), playerId, tokenDigest, expiresAt);
    await this.sessions.save(session);
    return { token, expiresAt };
  }
}
