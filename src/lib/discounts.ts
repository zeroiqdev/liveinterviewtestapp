/**
 * Discount codes: the rules (pure, tested) and the checks against the
 * database. An admin makes codes in the admin portal; people enter them in the
 * pass dialog. Safe to use in the browser (the generator is in the admin route).
 */

export type DiscountKind = "percent" | "free_passes";

export interface DiscountRule {
    code: string;
    kind: DiscountKind;
    value: number;
    maxUses: number | null;
    uses: number;
    redeemedBy: string[];
    expiresAt: Date | null;
    active: boolean;
}

export const MAX_FREE_PASSES = 50;

/** What a person typed, as stored: upper case, letters, numbers and dashes. */
export function normalizeDiscountCode(raw: unknown): string {
    return typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24) : "";
}

/** Why a code can't be used by this person now, in words to show them, or null when it can. */
export function discountProblem(rule: DiscountRule | null, email: string, now: Date = new Date()): string | null {
    if (!rule || !rule.active) return "That code isn't valid.";
    if (rule.expiresAt && rule.expiresAt.getTime() < now.getTime()) return "That code has expired.";
    if (rule.maxUses !== null && rule.uses >= rule.maxUses) return "That code has been fully used.";
    if (rule.redeemedBy.includes(email.toLowerCase())) return "You've already used that code.";
    return null;
}

/** The price after a percentage code, in whole naira (never below zero). */
export function discountedAmount(amount: number, rule: Pick<DiscountRule, "kind" | "value">): number {
    if (rule.kind !== "percent") return amount;
    const percent = Math.max(0, Math.min(100, rule.value));
    return Math.max(0, Math.round((amount * (100 - percent)) / 100));
}

/** Checks what an admin entered for a new code; null when it's fine. */
export function newCodeProblem(input: { kind: unknown; value: unknown; maxUses: unknown }): string | null {
    if (input.kind !== "percent" && input.kind !== "free_passes") return "Choose a percentage off or free passes.";
    const value = Number(input.value);
    if (!Number.isInteger(value)) return "Enter a whole number.";
    if (input.kind === "percent" && (value < 1 || value > 100)) return "A percentage must be between 1 and 100.";
    if (input.kind === "free_passes" && (value < 1 || value > MAX_FREE_PASSES)) return `Free passes must be between 1 and ${MAX_FREE_PASSES}.`;
    if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses !== "") {
        const max = Number(input.maxUses);
        if (!Number.isInteger(max) || max < 1) return "The use limit must be a whole number of 1 or more.";
    }
    return null;
}

/** How a code reads in the dialog and admin ("20% off", "3 free passes"). */
export function describeDiscount(rule: Pick<DiscountRule, "kind" | "value">): string {
    return rule.kind === "percent" ? `${rule.value}% off` : `${rule.value} free ${rule.value === 1 ? "pass" : "passes"}`;
}
