import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain text password against a stored hash or legacy plain text.
 * Returns valid status and whether the stored password needs an upgrade to bcrypt.
 */
export async function verifyPassword(
    plain: string,
    stored: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
    if (!stored || !plain) {
        return { valid: false, needsUpgrade: false };
    }

    const trimmedPlain = plain.trim();
    const isBcrypt = stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");

    if (isBcrypt) {
        const valid = await bcrypt.compare(trimmedPlain, stored);
        return { valid, needsUpgrade: false };
    }

    // Legacy plain text check
    const valid = trimmedPlain === stored.trim();
    return { valid, needsUpgrade: valid };
}
