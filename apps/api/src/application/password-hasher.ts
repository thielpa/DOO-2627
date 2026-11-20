/** Hashes and verifies plaintext credentials without exposing runtime-specific APIs. */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}
