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

export const QUESTION_BANK: BankQuestion[] =
    questionBankFile as unknown as BankQuestion[];

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

/** Pool query — the blueprint never embeds question text. */
export function queryPool(filter: QuestionPoolFilter): BankQuestion[] {
    return QUESTION_BANK.filter(
        (q) =>
            q.role_family === filter.role_family &&
            filter.category_in.includes(q.category)
    );
}

/** General behavioral pool (shared across blueprints). */
export function generalPool(): BankQuestion[] {
    return QUESTION_BANK.filter((q) => q.role_family === GENERAL_POOL.roleFamily);
}

export function questionById(id: string): BankQuestion | null {
    return QUESTION_BANK.find((q) => q.id === id) ?? null;
}
