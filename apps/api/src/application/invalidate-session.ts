import type { SessionRepository } from "../domain";
import { digestSessionToken } from "./session-token";

/** Invalidates the session identified by this token; unknown tokens are a no-op. */
export class InvalidateSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly now: () => Date,
  ) {}

  async execute(token: string): Promise<void> {
    const session = await this.sessions.byTokenDigest(await digestSessionToken(token));
    if (!session || session.invalidatedAt !== null) return;
    session.invalidate(this.now());
    await this.sessions.save(session);
  }
}
