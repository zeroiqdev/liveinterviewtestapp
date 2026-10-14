/**
 * Weekly tips, written per role by the model and held as drafts until someone
 * approves them in the admin portal. Nothing the model writes reaches a user
 * unapproved; a week with no approved tip falls back to the fixed list in
 * lib/weeklyTips.
 */

import dbConnect from "@/lib/mongodb";
import WeeklyTipDraft from "@/models/WeeklyTipDraft";
import { callJSON } from "@/engine/llm";
import { TIP_ACTIONS, actionForTopic, tipForWeek, weekNumber, type TipAction } from "@/lib/weeklyTips";

/** The kinds of role tips are written for, with the words used for each in the prompt and the admin portal. */
export const TIP_FAMILIES: Record<string, string> = {
    general: "Any role",
    product_manager: "Product management",
    product_designer: "Product design",
    ui_designer: "UI design",
    data_analyst: "Data analysis",
    frontend_developer: "Frontend engineering",
    backend_engineer: "Software engineering",
    devops_sre: "DevOps and reliability",
    customer_service: "Customer service",
    sales: "Sales and business development",
    banking_finance: "Banking and finance",
    virtual_assistant: "Virtual and executive assistants",
    oil_gas: "Oil and gas",
    business_analyst: "Business analysis and operations",
};

/** Families that share another family's tips. */
const FAMILY_ALIASES: Record<string, string> = {
    product: "product_manager",
    design: "product_designer",
    data: "data_analyst",
    data_science: "data_analyst",
    engineering: "backend_engineer",
    operations: "business_analyst",
    business: "business_analyst",
};

export function tipFamily(family: string | undefined | null): string {
    const key = (family || "").toLowerCase();
    const resolved = FAMILY_ALIASES[key] ?? key;
    return TIP_FAMILIES[resolved] ? resolved : "general";
}

const TOPICS = ["Job search", "Interviews", "Career growth", "Your CV"];
const MAX_TITLE = 90;
const MAX_BODY = 420;
const MAX_TRY = 140;

export interface TipText {
    topic: string;
    title: string;
    body: string;
    tryThis: string;
    action: TipAction;
}

/** Trims and bounds a tip, whether it came from the model or from the admin form. */
export function cleanTip(raw: Partial<TipText> | null | undefined): TipText | null {
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const title = text(raw?.title, MAX_TITLE);
    const body = text(raw?.body, MAX_BODY);
    if (title.length < 8 || body.length < 40) return null;
    const topic = TOPICS.find((known) => known.toLowerCase() === text(raw?.topic, 30).toLowerCase()) ?? "Interviews";
    // The button under the tip must do what the tip asks, or not be there.
    const action = TIP_ACTIONS.find((known) => known === raw?.action) ?? actionForTopic(topic);
    return { topic, title, body, tryThis: text(raw?.tryThis, MAX_TRY), action };
}

const SYSTEM = `You write one short, practical career tip a week for people preparing for job interviews, most of them in Nigeria and elsewhere in Africa.

You will be given a list of role groups. Write ONE tip for EACH group, specific to interviews, job search, CVs or career growth in that kind of work. A tip for sales must be about sales; a tip for customer service must be about customer service. The "general" group gets a tip that suits any role.

Rules:
- Plain, direct English that a busy person reads in 15 seconds. No jargon, no buzzwords, no exclamation marks.
- Never mention AI, technology that wrote this, or this product.
- "title": the advice itself in under 12 words, like a friend would say it. Not a headline.
- "body": two or three sentences, under 60 words. Say what to do and why it works. Use a concrete example from that kind of work.
- "tryThis": one small thing to do this week, under 18 words, starting with a verb.
- "topic": exactly one of "Job search", "Interviews", "Career growth", "Your CV".
- "action": the button shown under the tip. It must let the reader do "tryThis" straight away, so choose exactly one:
    "jobs" if tryThis is about finding, choosing or applying to jobs (opens a jobs board);
    "practice" if tryThis is about rehearsing or saying an answer out loud (starts a practice interview);
    "resume" if tryThis is about changing their CV (opens their CV review);
    "none" if tryThis happens outside this app (messaging someone, research, writing notes).
  Prefer a tip whose tryThis can be done with "jobs", "practice" or "resume".
- Do not repeat or lightly reword any tip listed under "Already sent".
- Do not invent statistics or name real companies.

Return strict JSON: {"tips":[{"family":"<group key>","topic":"...","title":"...","body":"...","tryThis":"...","action":"..."}]}`;

export interface GenerateResult {
    week: number;
    written: string[];
    /** Families left alone because their tip was already approved or edited. */
    kept: string[];
    failed: string[];
}

/**
 * Writes drafts for a week. Approved tips and ones an admin has edited are
 * never overwritten unless `force` names that family.
 */
export async function generateTipDrafts(week: number, opts: { families?: string[]; force?: boolean } = {}): Promise<GenerateResult> {
    await dbConnect();
    const wanted = (opts.families?.length ? opts.families : Object.keys(TIP_FAMILIES)).filter((family) => TIP_FAMILIES[family]);
    const existing = await WeeklyTipDraft.find({ week }).lean();
    const kept: string[] = [];
    const families = wanted.filter((family) => {
        const current = existing.find((tip) => tip.family === family);
        const protectedTip = current && (current.status === "approved" || current.edited) && !opts.force;
        if (protectedTip) kept.push(family);
        return !protectedTip;
    });
    if (families.length === 0) return { week, written: [], kept, failed: [] };

    // What each group has had recently, so the model doesn't repeat itself.
    const recent = await WeeklyTipDraft.find({ week: { $lt: week, $gte: week - 12 }, family: { $in: families } })
        .select("family title")
        .lean();
    const sent = families
        .map((family) => {
            const titles = recent.filter((tip) => tip.family === family).map((tip) => `"${tip.title}"`);
            return titles.length ? `${family}: ${titles.join("; ")}` : null;
        })
        .filter(Boolean)
        .join("\n");

    const user = `Role groups (key: description):
${families.map((family) => `${family}: ${TIP_FAMILIES[family]}`).join("\n")}

Already sent:
${sent || "(nothing yet)"}`;

    let tips: Array<Partial<TipText> & { family?: string }> = [];
    try {
        const reply = await callJSON<{ tips?: Array<Partial<TipText> & { family?: string }> }>({
            system: SYSTEM,
            user,
            maxTokens: 3500,
            timeoutMs: 60000,
            temperature: 0.8,
        });
        tips = Array.isArray(reply?.tips) ? reply.tips : [];
    } catch (err) {
        console.error("[weeklyTips] generation failed:", err);
        return { week, written: [], kept, failed: families };
    }

    const written: string[] = [];
    for (const family of families) {
        const clean = cleanTip(tips.find((tip) => tip.family === family));
        if (!clean) continue;
        await WeeklyTipDraft.updateOne(
            { week, family },
            { $set: { ...clean, status: "draft", edited: false }, $unset: { approvedBy: "", approvedAt: "" } },
            { upsert: true }
        );
        written.push(family);
    }
    return { week, written, kept, failed: families.filter((family) => !written.includes(family)) };
}

export interface DeliveredTip extends TipText {
    week: number;
    /** False when this is the fixed stand-in because nothing was approved for the week. */
    forRole: boolean;
}

/**
 * The tip a user sees for a week: the approved one for their kind of role,
 * else the approved general one, else the fixed stand-in. Drafts are never returned.
 */
export async function approvedTipFor(family: string, week: number): Promise<DeliveredTip> {
    await dbConnect();
    const key = tipFamily(family);
    const approved = await WeeklyTipDraft.find({ week, status: "approved", family: { $in: [key, "general"] } }).lean();
    const tip = approved.find((candidate) => candidate.family === key) ?? approved.find((candidate) => candidate.family === "general");
    if (tip) {
        const action = TIP_ACTIONS.find((known) => known === tip.action) ?? actionForTopic(tip.topic);
        return { week, topic: tip.topic, title: tip.title, body: tip.body, tryThis: tip.tryThis, action, forRole: tip.family === key && key !== "general" };
    }
    const standIn = tipForWeek(new Date(), weekNumber() - week);
    return { week, topic: standIn.topic, title: standIn.title, body: standIn.body, tryThis: standIn.tryThis, action: standIn.action, forRole: false };
}
