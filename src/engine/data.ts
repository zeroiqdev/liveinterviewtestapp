/* ══════════════════════════════════════
   Data layer — blueprints + question bank
   Read-only during sessions.
   ══════════════════════════════════════ */

import blueprintFile from "./data/blueprints.json";
import questionBankFile from "./data/questionBank.json";
import type {
    BankQuestion,
    Blueprint,
    BlueprintFile,
    GeneralBehavioralPool,
    QuestionPoolFilter,
} from "./types";

const file = blueprintFile as unknown as BlueprintFile;

export const GENERAL_POOL: GeneralBehavioralPool = file.generalBehavioralPool;

function stripBold(text: string): string {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
}

export const QUESTION_BANK: BankQuestion[] = (
    questionBankFile as unknown as BankQuestion[]
).map((q) => ({ ...q, question: stripBold(q.question) }));

export function listBlueprints(): Pick<
    Blueprint,
    "blueprintId" | "role" | "level"
>[] {
    return Object.values(file.blueprints).map((b) => ({
        blueprintId: b.blueprintId,
        role: b.role,
        level: b.level,
    }));
}

export function getBlueprint(blueprintId: string): Blueprint | null {
    return file.blueprints[blueprintId] ?? null;
}

/** Pool query — supports both static bank and dynamic custom questions. */
export function queryPool(filter: QuestionPoolFilter, customPool?: BankQuestion[]): BankQuestion[] {
    const source = customPool && customPool.length > 0 ? [...customPool, ...QUESTION_BANK] : QUESTION_BANK;
    return source.filter(
        (q) =>
            (q.role_family === filter.role_family || q.applies_to_all) &&
            filter.category_in.some((c) => q.category.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(q.category.toLowerCase()))
    );
}

/** General behavioral pool (shared across blueprints). */
export function generalPool(): BankQuestion[] {
    return QUESTION_BANK.filter((q) => q.role_family === GENERAL_POOL.roleFamily);
}

export function questionById(id: string): BankQuestion | null {
    return QUESTION_BANK.find((q) => q.id === id) ?? null;
}
