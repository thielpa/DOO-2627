import type { Session } from "./session";

export interface SessionRepository {
  byTokenDigest(tokenDigest: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
}
