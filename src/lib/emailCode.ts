/**
 * Emailed one-time codes for verifying a sign-up and resetting a password:
 * 6 digits, valid for 10 minutes, at most MAX_ATTEMPTS guesses, single use.
 * Requesting a new code replaces the previous one for that purpose.
 *
 * Codes are never a way to log in on their own: day-to-day sign-in is a
 * password or Google.
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import dbConnect from "@/lib/mongodb";
import EmailCode, { type EmailCodePurpose } from "@/models/EmailCode";
import { sendEmail } from "@/lib/email";

export type { EmailCodePurpose } from "@/models/EmailCode";

export const CODE_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const EMAILS: Record<EmailCodePurpose, { subject: (code: string) => string; intro: string }> = {
    verify: {
        subject: (code) => `Your get prepped verification code: ${code}`,
        intro: "Use this code to verify your email and finish creating your account:",
    },
    reset: {
        subject: (code) => `Your get prepped password reset code: ${code}`,
        intro: "Use this code to reset your password:",
    },
};

function hashCode(email: string, purpose: EmailCodePurpose, code: string): string {
    const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || "";
    return createHmac("sha256", secret).update(`${purpose}:${email}:${code}`).digest("hex");
}

export function normalizeCode(input: unknown): string {
    return String(input ?? "").replace(/\D/g, "");
}

/**
 * Create a fresh code and email it. Returns false when a code for the same
 * purpose was sent within the cooldown window (callers should not reveal this).
 */
export async function issueEmailCode(email: string, purpose: EmailCodePurpose): Promise<boolean> {
    await dbConnect();
    const existing = await EmailCode.findOne({ email, purpose }).lean();
    if (existing && Date.now() - new Date(existing.createdAt).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
        return false;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await EmailCode.findOneAndUpdate(
        { email, purpose },
        {
            email,
            purpose,
            codeHash: hashCode(email, purpose, code),
            attempts: 0,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
        },
        { upsert: true }
    );

    const { subject, intro } = EMAILS[purpose];
    const footer = `It expires in ${CODE_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.`;
    await sendEmail({
        to: email,
        subject: subject(code),
        text: `${intro}\n\n${code}\n\n${footer}`,
        html: `<p>${intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>${footer}</p>`,
    });
    return true;
}

/** Check a submitted code. A correct code is consumed; wrong guesses are counted. */
export async function verifyEmailCode(email: string, purpose: EmailCodePurpose, code: string): Promise<boolean> {
    if (code.length !== 6) return false;
    await dbConnect();

    // Count the attempt before comparing so parallel guesses can't exceed the cap.
    const row = await EmailCode.findOneAndUpdate(
        { email, purpose, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { new: true }
    ).lean();
    if (!row) return false;

    const expected = Buffer.from(row.codeHash, "hex");
    const actual = Buffer.from(hashCode(email, purpose, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

    // Single use: only the request that deletes the row wins.
    const deleted = await EmailCode.deleteOne({ _id: row._id, codeHash: row.codeHash });
    return deleted.deletedCount === 1;
}
