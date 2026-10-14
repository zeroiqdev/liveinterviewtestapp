/**
 * The coach's weekly tips: one each week, the same for everyone, in a fixed
 * order so a new one appears every Monday without anyone publishing it.
 * Add new tips at the END of the list; the order is the schedule.
 */

/**
 * What the button under a tip does: open the jobs board, start a practice
 * interview, open the resume review, or nothing (the tip is done elsewhere).
 */
export type TipAction = "jobs" | "practice" | "resume" | "none";
export const TIP_ACTIONS: TipAction[] = ["jobs", "practice", "resume", "none"];

/** The usual action for a topic, for tips that don't name one. */
export function actionForTopic(topic: string): TipAction {
    if (topic === "Job search") return "jobs";
    if (topic === "Your CV") return "resume";
    if (topic === "Interviews") return "practice";
    return "none";
}

export interface WeeklyTip {
    topic: "Job search" | "Interviews" | "Career growth" | "Your CV";
    /** Left out when the topic's usual action fits. */
    action?: TipAction;
    title: string;
    /** The tip itself, in two or three plain sentences. */
    body: string;
    /** One thing to do this week. */
    tryThis: string;
}

export const WEEKLY_TIPS: WeeklyTip[] = [
    {
        topic: "Interviews",
        title: "Open “Tell me about yourself” in three parts",
        body: "Say what you do now, how you got here, and why this role is next. Keep it under two minutes. Interviewers use this answer to decide what to ask you about, so mention the work you most want to discuss.",
        tryThis: "Record your answer once and time it.",
    },
    {
        topic: "Job search",
        title: "Answer the salary question with a range",
        action: "none",
        body: "Give a range you have researched for the role and city, not a single number, and say it calmly. If you are asked early, it is fine to say you would like to understand the role first.",
        tryThis: "Look up three salaries for your role this week and write down your range.",
    },
    {
        topic: "Your CV",
        title: "Start each line with what changed",
        body: "“Responsible for customer complaints” says what your job was. “Cut complaint response time from two days to four hours” says what you did. Lead with the result, then how you got it.",
        tryThis: "Rewrite your top three lines this way.",
    },
    {
        topic: "Career growth",
        title: "Ask for feedback after a rejection",
        body: "Most people never ask. A short, polite reply asking for one thing you could have done better often gets an honest answer, and it leaves a good impression for the next opening.",
        tryThis: "Send that message to the last company that turned you down.",
    },
    {
        topic: "Interviews",
        title: "Say “I”, not “we”",
        body: "“We launched the product” hides your part. Interviewers are hiring you, not your team. Give credit to the team, then say exactly what you did.",
        tryThis: "In your next practice interview, catch yourself each time you say “we”.",
    },
    {
        topic: "Job search",
        title: "Apply to fewer jobs, better",
        body: "Ten applications shaped to the job description usually beat fifty identical ones. Use the words the posting uses for skills you really have, and put the most relevant experience first.",
        tryThis: "Pick two jobs this week and tailor your CV for each.",
    },
    {
        topic: "Interviews",
        title: "Have three stories ready",
        body: "A time something went wrong, a time you disagreed with someone, and a time you are proud of. Most behavioural questions can be answered with one of these, told from a different angle.",
        tryThis: "Write each story as five bullet points.",
    },
    {
        topic: "Your CV",
        title: "Put numbers where you can",
        body: "Numbers make a claim believable. How many customers, how much money, how much time saved, how big the team. An honest estimate is better than no number, as long as you can explain it.",
        tryThis: "Add one number to each of your last two roles.",
    },
    {
        topic: "Interviews",
        title: "It is fine to pause",
        body: "Three seconds of silence feels long to you and normal to the interviewer. Saying “let me think about that for a moment” sounds more confident than starting an answer you have to abandon.",
        tryThis: "In your next practice interview, pause before every answer.",
    },
    {
        topic: "Career growth",
        title: "Keep a list of what you did",
        body: "By the time you need a CV or a promotion case, you have forgotten half your wins. A running list of what you shipped, fixed and learned, updated every Friday, solves that.",
        tryThis: "Start the list today with three things from this month.",
    },
    {
        topic: "Interviews",
        title: "Ask questions that show you were listening",
        action: "none",
        body: "“What does a good first three months look like in this role?” and “What is the hardest part of the job?” tell you something real and show you are thinking about doing the work.",
        tryThis: "Prepare three questions for your next interview.",
    },
    {
        topic: "Job search",
        title: "Tell people you are looking",
        action: "none",
        body: "Many roles are filled through someone who knew someone. A short message to former colleagues saying what you are looking for costs nothing and is often how the first interview happens.",
        tryThis: "Message five people this week.",
    },
    {
        topic: "Interviews",
        title: "Answer the question that was asked",
        body: "It is tempting to give the answer you prepared. If the question is “why did you leave?”, answer that in a sentence or two before adding anything else. Direct answers build trust.",
        tryThis: "After each practice answer, ask yourself whether you answered the question.",
    },
    {
        topic: "Your CV",
        title: "One page is enough for most people",
        body: "A recruiter spends well under a minute on a first read. Cut older and unrelated roles down to a line each so your most relevant work is impossible to miss.",
        tryThis: "Remove everything that does not help you get this kind of job.",
    },
    {
        topic: "Interviews",
        title: "Talk about a failure honestly",
        body: "Choose a real mistake, say what you got wrong without blaming others, and spend most of the answer on what you changed afterwards. The lesson is what they are listening for.",
        tryThis: "Practise your failure story out loud once.",
    },
    {
        topic: "Career growth",
        title: "Learn what the role above you does",
        body: "The quickest way to be considered for the next level is to already be doing parts of it. Ask someone in that role what takes most of their time, and take one piece of it off your manager's plate.",
        tryThis: "Ask one person in that role for fifteen minutes.",
    },
    {
        topic: "Interviews",
        title: "Research the company for ten minutes",
        action: "none",
        body: "Know what they sell, who buys it, and one recent thing that happened to them. Then link one of your answers to it. That is enough to stand out from candidates who did none.",
        tryThis: "Do this for the next company you interview with.",
    },
    {
        topic: "Job search",
        title: "Follow up once, a week later",
        action: "none",
        body: "If you have heard nothing, one short, friendly message a week after the interview is normal and welcome. Say you are still interested and ask whether there is anything else they need.",
        tryThis: "Send any follow-up you have been putting off.",
    },
    {
        topic: "Interviews",
        title: "End your answer on the result",
        body: "Many answers trail off. Finish with what happened because of your work, then stop talking. A clear ending lets the interviewer move on and remember the point.",
        tryThis: "Finish every practice answer with a single sentence on the result.",
    },
    {
        topic: "Career growth",
        title: "Explain a gap without apologising",
        body: "A gap needs one honest sentence: what it was and that you are ready to work. Then move to what you can do for them. You do not owe anyone a long explanation.",
        tryThis: "Write your one sentence and say it out loud.",
    },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A Monday long ago: weeks are counted from here, so they change on Mondays (UTC). */
const FIRST_MONDAY = Date.UTC(2024, 0, 1);

/** How many whole weeks have passed since the first Monday. */
export function weekNumber(date: Date = new Date()): number {
    return Math.floor((date.getTime() - FIRST_MONDAY) / WEEK_MS);
}

/** The tip for the week `date` falls in (or `weeksAgo` weeks earlier). */
export function tipForWeek(date: Date = new Date(), weeksAgo = 0): WeeklyTip & { week: number; action: TipAction } {
    const week = weekNumber(date) - weeksAgo;
    const index = ((week % WEEKLY_TIPS.length) + WEEKLY_TIPS.length) % WEEKLY_TIPS.length;
    const tip = WEEKLY_TIPS[index];
    return { ...tip, action: tip.action ?? actionForTopic(tip.topic), week };
}
