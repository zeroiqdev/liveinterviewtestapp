import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

before(() => {
    process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";
    process.env.ADMIN_EMAILS = "admin@example.com";
});

describe("isAdminUser", () => {
    it("requires a verified email for ADMIN_EMAILS to grant admin", async () => {
        const { isAdminUser } = await import("../src/lib/session");
        assert.equal(isAdminUser({ email: "admin@example.com", emailVerified: true }), true);
        assert.equal(isAdminUser({ email: "admin@example.com", emailVerified: false }), false);
        assert.equal(isAdminUser({ email: "admin@example.com" }), false);
        assert.equal(isAdminUser({ email: "someone@example.com", emailVerified: true }), false);
        assert.equal(isAdminUser({ email: "someone@example.com", isAdmin: true }), true);
        assert.equal(isAdminUser(null), false);
    });
});

describe("session tokens", () => {
    const payload = {
        userId: "u1",
        email: "user@example.com",
        name: "User",
        role: "Software Engineer",
        domain: "Software & Engineering",
        roleFamily: "engineering",
        seniority: "professional",
        systemRole: "user" as const,
        isAdmin: false,
    };

    it("round-trips a signed session", async () => {
        const { signSessionToken, verifySessionToken } = await import("../src/lib/sessionToken");
        const session = await verifySessionToken(await signSessionToken(payload));
        assert.equal(session?.email, "user@example.com");
        assert.equal(session?.isAdmin, false);
    });

    it("rejects tampered tokens and relay tokens", async () => {
        const { signSessionToken, verifySessionToken } = await import("../src/lib/sessionToken");
        const { signRelayToken } = await import("../src/lib/relayToken");
        const token = await signSessionToken(payload);
        const [h, , s] = token.split(".");
        const forged = Buffer.from(JSON.stringify({ ...payload, isAdmin: true })).toString("base64url");
        assert.equal(await verifySessionToken(`${h}.${forged}.${s}`), null);
        assert.equal(await verifySessionToken(await signRelayToken({ sessionId: "s", ownerId: "o" })), null);
    });

    it("refuses to run without a strong secret", async () => {
        const { getJwtSecretKey } = await import("../src/lib/sessionToken");
        const saved = process.env.AUTH_SECRET;
        process.env.AUTH_SECRET = "short";
        try {
            assert.throws(() => getJwtSecretKey());
        } finally {
            process.env.AUTH_SECRET = saved;
        }
    });
});

describe("relay tokens", () => {
    it("carry a unique id so the relay can make them single use", async () => {
        const { signRelayToken, verifyRelayToken } = await import("../src/lib/relayToken");
        const a = await verifyRelayToken(await signRelayToken({ sessionId: "s", ownerId: "o" }));
        const b = await verifyRelayToken(await signRelayToken({ sessionId: "s", ownerId: "o" }));
        assert.ok(a?.jti && b?.jti);
        assert.notEqual(a.jti, b.jti);
    });
});

describe("passwords", () => {
    it("verifies bcrypt hashes and never accepts plain-text storage", async () => {
        const { hashPassword, verifyPassword } = await import("../src/lib/password");
        const hash = await hashPassword("correct horse");
        assert.equal(await verifyPassword("correct horse", hash), true);
        assert.equal(await verifyPassword("wrong", hash), false);
        assert.equal(await verifyPassword("plaintext", "plaintext"), false);
        assert.equal(await verifyPassword("", hash), false);
    });
});

describe("normalizeCode", () => {
    it("keeps digits only", async () => {
        const { normalizeCode } = await import("../src/lib/emailCode");
        assert.equal(normalizeCode(" 123 456 "), "123456");
        assert.equal(normalizeCode(undefined), "");
        assert.equal(normalizeCode(123456), "123456");
    });
});

describe("session revocation", () => {
    it("rejects sessions issued before the user's cutoff and keeps newer ones", async () => {
        const { issuedBeforeCutoff, revocationCutoff } = await import("../src/lib/session");
        const { signSessionToken, verifySessionToken } = await import("../src/lib/sessionToken");
        const base = {
            userId: "u1", email: "user@example.com", name: "", role: "", domain: "",
            roleFamily: "", seniority: "", systemRole: "user" as const, isAdmin: false,
        };

        const old = { ...base, iat: Math.floor(Date.now() / 1000) - 60 };
        const cutoff = revocationCutoff();
        assert.equal(issuedBeforeCutoff(old, { sessionsValidAfter: cutoff }), true);
        assert.equal(issuedBeforeCutoff(old, {}), false);
        assert.equal(issuedBeforeCutoff(old, null), false);

        // A session issued right after the cutoff (same second) stays valid.
        const fresh = await verifySessionToken(await signSessionToken(base));
        assert.ok(fresh?.iat);
        assert.equal(issuedBeforeCutoff(fresh, { sessionsValidAfter: cutoff }), false);
    });

    it("never signs a caller-supplied iat into the token", async () => {
        const { signSessionToken, verifySessionToken } = await import("../src/lib/sessionToken");
        const token = await signSessionToken({
            userId: "u1", email: "user@example.com", name: "", role: "", domain: "",
            roleFamily: "", seniority: "", systemRole: "user", isAdmin: false, iat: 1,
        });
        const session = await verifySessionToken(token);
        assert.ok(session?.iat && session.iat > 1);
    });
});
