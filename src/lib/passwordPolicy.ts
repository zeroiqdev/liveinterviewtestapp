/**
 * Password rules, shared by the server (which enforces them) and the sign-up
 * and reset forms (which show them as a live checklist), so the two can never
 * disagree. They apply when a password is set; existing passwords still work.
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordRule {
    id: "length" | "uppercase" | "lowercase" | "number" | "special";
    label: string;
    test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH },
    { id: "uppercase", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
    { id: "lowercase", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
    { id: "number", label: "One number", test: (p) => /[0-9]/.test(p) },
    { id: "special", label: "One special character (e.g. !@#)", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

/** Rules the password doesn't meet yet (empty when it's acceptable). */
export function unmetPasswordRules(password: string): PasswordRule[] {
    return PASSWORD_RULES.filter((rule) => !rule.test(password));
}

export function isStrongPassword(password: string): boolean {
    return unmetPasswordRules(password).length === 0;
}

/** A plain-language message for the first unmet rules, or null when acceptable. */
export function passwordProblem(password: string): string | null {
    const unmet = unmetPasswordRules(password);
    if (unmet.length === 0) return null;
    const needs = unmet.map((rule) => rule.label.charAt(0).toLowerCase() + rule.label.slice(1));
    const list = needs.length > 1 ? `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}` : needs[0];
    return `Your password needs ${list}.`;
}
