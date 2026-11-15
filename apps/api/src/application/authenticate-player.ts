import { Player, type PlayerRepository } from "../domain";
import type { PasswordHasher } from "./password-hasher";

export class AuthenticationError extends Error {
  constructor() {
    super("Invalid username or password");
    this.name = "AuthenticationError";
  }
}

export interface AuthenticatePlayerInput {
  username: string;
  password: string;
}

export interface AuthenticatedPlayer {
  id: string;
  username: string;
}

/** Authenticates an existing Player or creates one on first login. */
export class AuthenticatePlayer {
  constructor(
    private readonly players: PlayerRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute({ username, password }: AuthenticatePlayerInput): Promise<AuthenticatedPlayer> {
    const existing = await this.players.byUsername(username);
    if (existing) {
      if (!(await this.passwordHasher.verify(password, existing.passwordHash))) {
        throw new AuthenticationError();
      }
      return this.publicIdentity(existing);
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const player = Player.create(crypto.randomUUID(), username, passwordHash);
    await this.players.save(player);
    return this.publicIdentity(player);
  }

  private publicIdentity(player: Player): AuthenticatedPlayer {
    return { id: player.id, username: player.username };
  }
}
