import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export function isBcryptHash(stored: string): boolean {
    return stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");
}

/**
 * Verify a plain text password against a stored bcrypt hash. Legacy
 * plain-text values are never accepted; scripts/migrate-plaintext-passwords.ts
 * hashes any that remain, and affected users can sign in with an emailed code.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (!stored || !plain || !isBcryptHash(stored)) return false;
    return bcrypt.compare(plain.trim(), stored);
}
