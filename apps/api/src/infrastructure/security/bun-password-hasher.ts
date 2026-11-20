import type { PasswordHasher } from "../../application/password-hasher";

export class BunPasswordHasher implements PasswordHasher {
  hash(plaintext: string): Promise<string> {
    return Bun.password.hash(plaintext, { algorithm: "argon2id" });
  }

  verify(plaintext: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plaintext, hash);
  }
}
