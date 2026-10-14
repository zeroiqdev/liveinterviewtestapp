/**
 * Files a job under a kind of role by reading its description, for jobs whose
 * title doesn't settle it. A "Program Manager" who owns a roadmap and writes
 * requirements is doing product management; one who tracks delivery dates is
 * not, and only the description says which.
 *
 * Titles that are clear ("Senior Product Manager", "Customer Service
 * Representative") are filed by the title and never sent here.
 */

import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import { callJSON } from "@/engine/llm";

/** The kinds of role a job can be filed under, as described to the model. */
export const ROLE_FAMILIES: Record<string, string> = {
    product_manager: "Decides what a product should do and why: owns the roadmap, writes requirements, prioritises with engineering and design, measures whether it worked.",
    product_designer: "Designs how a product works for users: research, flows, wireframes, prototypes, usability.",
    ui_designer: "Designs how screens look: visual design, layout, typography, design systems.",
    product_marketer: "Takes a product to market: positioning, messaging, launches, campaigns.",
    data_analyst: "Answers questions with data: analysis, SQL, dashboards, statistics, models, data pipelines.",
    frontend_developer: "Writes the code people see and touch: web and mobile apps and their interfaces.",
    backend_engineer: "Writes software systems: services, APIs, databases, general software engineering.",
    devops_sre: "Keeps software running: cloud infrastructure, deployment, monitoring, reliability, system administration.",
    business_analyst: "Works out what a business needs and improves how it runs: requirements, processes, operations analysis.",
    banking_finance: "Money work: accounting, audit, banking operations, credit, treasury, financial analysis, compliance.",
    sales: "Sells: finding customers, closing deals, account management, business development.",
    customer_service: "Helps customers directly: support, call centre, complaints, customer success.",
    virtual_assistant: "Administrative support: assistants, office administration, scheduling, front desk.",
    oil_gas: "Oil, gas and energy field work: drilling, production, HSE and safety, field engineering.",
};

const BATCH = 12;
const EXCERPT = 1100;

const SYSTEM = `You sort job postings by the kind of work they are, for people looking for jobs in their own field.

You are given role families (key: what that work is) and a list of jobs, each with a title and part of its description.
For each job choose the ONE family whose everyday work this job is, judging by what the description says the person will DO, not by the words in the title.

- A title can mislead. A "Program Manager" or "Project Manager" who owns a product roadmap, gathers requirements and prioritises features belongs in product_manager. One who coordinates schedules, vendors, events, construction or internal programmes does not.
- Choose a family only if someone working in that field would see this as a job in their field and could reasonably apply. Mentioning a field's tools or working alongside that team is not enough.
- If no family fits (HR, legal, teaching, medicine, logistics, manufacturing, marketing other than product marketing, general management, and so on) answer "general".

Return strict JSON: {"jobs":[{"id":"<id>","family":"<family key or general>"}]}`;

export interface JobToFile {
    id: string;
    title: string;
    description: string;
}

/** Asks the model which family each job belongs to. Jobs it doesn't answer for are left out. */
export async function fileJobsByDescription(jobs: JobToFile[]): Promise<Map<string, string>> {
    const filed = new Map<string, string>();
    if (jobs.length === 0) return filed;
    const user = `Role families:
${Object.entries(ROLE_FAMILIES).map(([key, what]) => `${key}: ${what}`).join("\n")}

Jobs:
${jobs.map((job) => `[${job.id}] ${job.title}\n${job.description.replace(/\s+/g, " ").slice(0, EXCERPT)}`).join("\n\n")}`;

    const reply = await callJSON<{ jobs?: Array<{ id?: string; family?: string }> }>({
        system: SYSTEM,
        user,
        maxTokens: 1200,
        timeoutMs: 45000,
        temperature: 0,
    });
    for (const answer of reply?.jobs ?? []) {
        const id = String(answer?.id ?? "");
        const family = String(answer?.family ?? "");
        if (!jobs.some((job) => job.id === id)) continue;
        filed.set(id, ROLE_FAMILIES[family] ? family : "general");
    }
    return filed;
}

export interface FilingRun {
    checked: number;
    moved: number;
    remaining: number;
}

/**
 * Files jobs that are waiting for a look at their description: no family from
 * the title, a real description, and not looked at before. Stops when
 * `budgetMs` is used up; the rest wait for the next run.
 */
export async function fileWaitingJobs(opts: { limit: number; budgetMs: number; concurrency?: number }): Promise<FilingRun> {
    const startedAt = Date.now();
    await dbConnect();
    const waiting = { roleFamily: "general", roleCheckedAt: { $exists: false }, fullDescription: { $exists: true, $ne: "" }, status: { $ne: "closed" } };
    const jobs = await Job.find(waiting).select("title fullDescription").limit(opts.limit).lean();
    let checked = 0;
    let moved = 0;
    const batches: Array<typeof jobs> = [];
    for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));

    const concurrency = opts.concurrency ?? 3;
    for (let i = 0; i < batches.length; i += concurrency) {
        if (Date.now() - startedAt > opts.budgetMs) break;
        await Promise.allSettled(
            batches.slice(i, i + concurrency).map(async (batch) => {
                const filed = await fileJobsByDescription(batch.map((job, index) => ({ id: String(index + 1), title: job.title, description: job.fullDescription || "" })));
                const now = new Date();
                const writes = batch
                    .map((job, index) => ({ job, family: filed.get(String(index + 1)) }))
                    .filter((entry): entry is { job: (typeof batch)[number]; family: string } => Boolean(entry.family))
                    .map(({ job, family }) => ({ updateOne: { filter: { _id: job._id }, update: { $set: { roleFamily: family, roleCheckedAt: now, roleFiledBy: "description" } } } }));
                if (writes.length) await Job.bulkWrite(writes, { ordered: false });
                checked += writes.length;
                moved += writes.filter((write) => write.updateOne.update.$set.roleFamily !== "general").length;
            })
        );
    }
    return { checked, moved, remaining: await Job.countDocuments(waiting) };
}
