import fs from "fs/promises";
import path from "path";
import dbConnect from "@/lib/mongodb";
import Role from "@/models/Role";
import Question from "@/models/Question";
import type { RoleItem } from "@/app/api/roles/route";
import type { QuestionItem } from "@/app/api/questions/route";

const ROLES_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "roles.json");
const QUESTIONS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "questionBank.json");

let rolesInitialized = false;
let questionsInitialized = false;

async function readLocalRoles(): Promise<RoleItem[]> {
    try {
        const data = await fs.readFile(ROLES_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function readLocalQuestions(): Promise<QuestionItem[]> {
    try {
        const data = await fs.readFile(QUESTIONS_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

export async function ensureRolesInitialized(): Promise<void> {
    if (rolesInitialized) return;
    try {
        await dbConnect();
        const count = await Role.countDocuments();
        if (count === 0) {
            const localRoles = await readLocalRoles();
            if (localRoles.length > 0) {
                await Role.insertMany(localRoles, { ordered: false }).catch(() => {});
            }
        }
        rolesInitialized = true;
    } catch (err) {
        console.warn("[adminStorage] Roles init error:", err);
    }
}

export async function ensureQuestionsInitialized(): Promise<void> {
    if (questionsInitialized) return;
    try {
        await dbConnect();
        const count = await Question.countDocuments();
        if (count === 0) {
            const localQuestions = await readLocalQuestions();
            if (localQuestions.length > 0) {
                const batchSize = 200;
                for (let i = 0; i < localQuestions.length; i += batchSize) {
                    await Question.insertMany(localQuestions.slice(i, i + batchSize), { ordered: false }).catch(() => {});
                }
            }
        }
        questionsInitialized = true;
    } catch (err) {
        console.warn("[adminStorage] Questions init error:", err);
    }
}

// ─── Roles ───────────────────────────────────────────────────────────────

export async function getRoles(): Promise<RoleItem[]> {
    try {
        await ensureRolesInitialized();
        const docs = await Role.find().sort({ id: 1 }).lean();
        if (docs.length > 0) {
            return docs.map((d) => ({
                id: d.id,
                title: d.title,
                domain: d.domain,
            }));
        }
    } catch (err) {
        console.warn("[adminStorage] Failed to read roles from DB:", err);
    }
    return readLocalRoles();
}

export async function saveRole(role: RoleItem): Promise<RoleItem> {
    try {
        await ensureRolesInitialized();
        await Role.findOneAndUpdate({ id: role.id }, { $set: role }, { upsert: true, new: true });
    } catch (err) {
        console.error("[adminStorage] Failed to save role to DB:", err);
    }
    return role;
}

export async function deleteRole(id: string): Promise<boolean> {
    try {
        await ensureRolesInitialized();
        await Role.deleteOne({ id });
        return true;
    } catch (err) {
        console.error("[adminStorage] Failed to delete role from DB:", err);
        return false;
    }
}

// ─── Questions ───────────────────────────────────────────────────────────

export async function getQuestions(filter?: {
    roleFamily?: string | null;
    category?: string | null;
    search?: string | null;
}): Promise<QuestionItem[]> {
    try {
        await ensureQuestionsInitialized();
        const query: Record<string, unknown> = {};
        if (filter?.roleFamily && filter.roleFamily !== "all") {
            query.role_family = filter.roleFamily;
        }
        if (filter?.category && filter.category !== "all") {
            query.category = filter.category;
        }
        if (filter?.search) {
            const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [{ question: regex }, { role_family: regex }, { category: regex }];
        }

        const docs = await Question.find(query).sort({ id: 1 }).lean();
        if (docs.length > 0 || (filter && Object.keys(query).length > 0)) {
            return docs.map((d) => ({
                id: d.id,
                role_family: d.role_family,
                sub_type: d.sub_type,
                question: d.question,
                category: d.category,
                applies_to_all: d.applies_to_all,
                source: d.source,
            }));
        }
    } catch (err) {
        console.warn("[adminStorage] Failed to read questions from DB:", err);
    }

    let local = await readLocalQuestions();
    if (filter?.roleFamily && filter.roleFamily !== "all") {
        local = local.filter((q) => q.role_family === filter.roleFamily);
    }
    if (filter?.category && filter.category !== "all") {
        local = local.filter((q) => q.category === filter.category);
    }
    if (filter?.search) {
        const q = filter.search.toLowerCase();
        local = local.filter(
            (item) =>
                item.question.toLowerCase().includes(q) ||
                item.role_family.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q)
        );
    }
    return local;
}

export async function saveQuestion(question: QuestionItem): Promise<QuestionItem> {
    try {
        await ensureQuestionsInitialized();
        await Question.findOneAndUpdate({ id: question.id }, { $set: question }, { upsert: true, new: true });
    } catch (err) {
        console.error("[adminStorage] Failed to save question to DB:", err);
    }
    return question;
}

export async function deleteQuestion(id: string): Promise<boolean> {
    try {
        await ensureQuestionsInitialized();
        await Question.deleteOne({ id });
        return true;
    } catch (err) {
        console.error("[adminStorage] Failed to delete question from DB:", err);
        return false;
    }
}
