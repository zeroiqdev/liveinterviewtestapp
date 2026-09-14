import { ArrowDown, ArrowRight, Play } from "@phosphor-icons/react";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import type { JobItem } from "@/app/api/jobs/route";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import { cleanJobTitle } from "./utils";

export type CharacterId = "coach" | "recruiter";

export interface ChatDmItem {
    id: string;
    sender: string;
    avatar: string;
    time: string;
    isOnline?: boolean;
    badgeLabel?: string;
    messages: string[];
    insight?: string;
    actions?: {
        label: string;
        primary?: boolean;
        icon?: React.ElementType;
        onClick?: () => void;
    }[];
}

export interface CharacterProfile {
    id: CharacterId;
    name: string;
    role: string;
    roleExplanation: string;
    avatar: string;
    unreadCount: number;
    items: ChatDmItem[];
}

// Module data for the hero cards
export const moduleCards = [
    {
        number: "01",
        title: "Technical\nInterview",
        icon: "code",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png"
    },
    {
        number: "02",
        title: "Behavioral\nInterview",
        icon: "chat",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
        isTall: true
    },
    {
        number: "03",
        title: "System\nDesign",
        icon: "design",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png"
    },
    {
        number: "04",
        title: "Skills\nAssessment",
        icon: "play",
        image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png"
    },
];

export const COACH_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485051/Screenshot_2026-07-31_at_7.49.46_AM_u6gpoz.png";
export const RECRUITER_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485049/Screenshot_2026-07-31_at_7.49.19_AM_qujtzo.png";

export interface BuildCharactersOptions {
    userRole?: string;
    userRoleFamily?: string;
    displayedJobs?: JobItem[];
    lastFeedback?: FeedbackReportData | null;
    onPractice?: () => void;
    onOpenJob?: (job: JobItem) => void;
}

export function buildCharactersForUser(opts: BuildCharactersOptions = {}): CharacterProfile[] {
    const {
        userRole,
        userRoleFamily,
        displayedJobs = [],
        lastFeedback,
        onPractice,
        onOpenJob,
    } = opts;

    const family = userRoleFamily || (userRole ? normalizeUserRoleFamily(userRole) : "general");
    const displayRole = userRole || (
        family === "product_manager" ? "Product Manager" :
        family === "product_designer" ? "Product Designer" :
        family === "data_analyst" ? "Data Analyst" :
        family === "frontend_developer" ? "Frontend Engineer" :
        family === "backend_engineer" ? "Software Engineer" : "Candidate"
    );

    // ─────────────────────────────────────────────────────────────
    // 1. INTERVIEW COACH: Accurate STAR Assessment + Role Domain
    // ─────────────────────────────────────────────────────────────
    const coachExplanation =
        family === "product_manager"
            ? "I analyze your responses, coach you on behavioral STAR stories, and drill you on product sense, metric definition & execution trade-offs."
            : family === "product_designer"
            ? "I analyze your responses, coach you on behavioral STAR stories, and drill you on user journey mapping, design systems & design critiques."
            : family === "data_analyst"
            ? "I analyze your responses, coach you on behavioral STAR stories, and drill you on product analytics, SQL metrics & A/B testing hypotheses."
            : family === "frontend_developer"
            ? "I analyze your responses, coach you on behavioral STAR stories, and drill you on UI performance, state boundaries & accessibility."
            : "I analyze your responses, coach you on behavioral STAR stories, and drill you on system design, technical architecture & problem solving.";

    // Item 1: STAR Structure (Evaluating actual feedback vs solid/poor)
    let starItem: ChatDmItem;
    if (lastFeedback) {
        const starScore = typeof lastFeedback.metrics?.structureStar === "number"
            ? lastFeedback.metrics.structureStar
            : 60;
        
        // Check if there is a specific improvement noting STAR or storytelling
        const starImprovement = lastFeedback.improvements?.find(imp =>
            /star|structure|situation|action|result|metric|quantif/i.test(imp.title + " " + imp.detail)
        );

        if (starScore < 65) {
            starItem = {
                id: "coach-star",
                sender: "Interview Coach",
                avatar: COACH_AVATAR,
                time: "Just now",
                isOnline: true,
                badgeLabel: "STAR Structure: Needs Work",
                messages: [
                    `Your behavioral STAR structure in your last mock session needs improvement (scored ${starScore}/100).`,
                    starImprovement
                        ? `${starImprovement.detail} Next time: ${starImprovement.recommendation}`
                        : `Your answers lacked clearly separated Actions and quantifiable Results. Structure each story: Situation (15%), Task (15%), specific personal Actions (50%), and measurable business impact (20%).`,
                ],
                insight: "Coach Insight: Clear Action ownership and quantifiable Results account for over 40% of the behavioral hiring bar.",
                actions: [
                    { label: "Practice STAR Drill", primary: true, icon: Play, onClick: onPractice },
                    { label: "View Scoring Rubric", icon: ArrowDown },
                ]
            };
        } else if (starScore < 78) {
            starItem = {
                id: "coach-star",
                sender: "Interview Coach",
                avatar: COACH_AVATAR,
                time: "Just now",
                isOnline: true,
                badgeLabel: "STAR Structure: Average",
                messages: [
                    `Your behavioral STAR structure in your last mock session was average (${starScore}/100).`,
                    starImprovement
                        ? `${starImprovement.detail} ${starImprovement.recommendation}`
                        : `Your context setup was clear, but make sure each behavioral story concludes with concrete business metrics (e.g. 'improved retention by 14%' or 'reduced delivery cycle by 3 weeks').`,
                ],
                insight: "Coach Insight: Concluding with quantifiable % metrics increases candidate offer rates by 40%.",
                actions: [
                    { label: "Practice Behavioral Drill", primary: true, icon: Play, onClick: onPractice },
                ]
            };
        } else {
            starItem = {
                id: "coach-star",
                sender: "Interview Coach",
                avatar: COACH_AVATAR,
                time: "Just now",
                isOnline: true,
                badgeLabel: "STAR Structure: Solid",
                messages: [
                    `Your behavioral STAR structure in your last mock session was strong (${starScore}/100), with articulate Situation, Task, Action, and measurable outcomes.`,
                    `Keep your storytelling cadence crisp and aim to wrap up complete answers under 2.5 minutes.`,
                ],
                insight: "Coach Insight: Concise, impact-driven STAR answers place you in the top 5% candidate percentile.",
                actions: [
                    { label: "Practice Advanced Drill", primary: true, icon: Play, onClick: onPractice },
                ]
            };
        }
    } else {
        starItem = {
            id: "coach-star",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "2m ago",
            isOnline: true,
            badgeLabel: "Behavioral & STAR",
            messages: [
                `When preparing for ${displayRole} behavioral interviews, structuring your stories with the STAR method (Situation, Task, Action, Result) is essential for top scores.`,
                `Spend 20% on the Situation & Task, 50% detailing your individual Actions, and 30% proving quantifiable business results (e.g. 'reduced customer churn by 18%').`,
            ],
            insight: "Coach Insight: Candidates who quantify business results in STAR answers receive 40% higher evaluation scores.",
            actions: [
                { label: "Practice Behavioral Drill", primary: true, icon: Play, onClick: onPractice },
                { label: "View STAR Guide", icon: ArrowDown },
            ]
        };
    }

    // Item 2: Domain-Specific Assessment (Strictly aligned to role, NO SWE for PMs!)
    let domainItem: ChatDmItem;
    if (family === "product_manager") {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "Product Sense & Metrics",
            messages: [
                "For Product Management rounds, focus on product sense, user segmentation, and ruthless prioritization. Use frameworks like CIRCLES or RICE to evaluate trade-offs.",
                "Always define your North Star Metric alongside secondary counter-metrics before proposing feature solutions.",
            ],
            insight: "Coach Insight: Elite PM candidates articulate the root user problem clearly before brainstorming solutions.",
            actions: [
                { label: "Practice Product Sense Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else if (family === "product_designer") {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "Design Systems & UX",
            messages: [
                "For Product Design interviews, walk the interviewer through your end-to-end user journeys, usability trade-offs, and design system component reusability.",
                "Be ready to defend your wireframing iterations, typography hierarchy, and accessibility (WCAG) standards.",
            ],
            insight: "Coach Insight: Walk through user pain points and edge cases before presenting final high-fidelity screens.",
            actions: [
                { label: "Practice Design System Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else if (family === "data_analyst") {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "Analytics & Experimentation",
            messages: [
                "For Data & Analytics interviews, sharpen your root cause analysis on metric anomalies, A/B testing hypothesis formulation, and cohort retention models.",
                "Practice explaining statistical significance, sample sizes, and p-values in plain, impactful business terms.",
            ],
            insight: "Coach Insight: Formulating structured hypotheses before data exploration demonstrates senior analytical maturity.",
            actions: [
                { label: "Practice Analytics Metric Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else if (family === "frontend_developer") {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "Frontend Architecture",
            messages: [
                "For Frontend engineering interviews, focus on state management boundaries, component rendering performance, and Core Web Vitals optimization.",
                "Review React concurrent patterns, memory leak prevention, and client-side caching strategies before your next session.",
            ],
            insight: "Coach Insight: Demonstrating DOM performance and accessibility (a11y) standards creates strong senior signal.",
            actions: [
                { label: "Practice Frontend Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else if (family === "backend_engineer") {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "System Architecture",
            messages: [
                "To reach top scoring in system architecture, sharpen your cache invalidation strategies, database sharding, and back-of-the-envelope throughput math.",
                "Review distributed queue guarantees and database indexing before your next live mock.",
            ],
            insight: "Coach Insight: Real-time calculation speed creates strong senior engineering signal.",
            actions: [
                { label: "Practice System Design Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else {
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "Domain Strategy",
            messages: [
                "Structure your domain answers with clear problem definition, structured trade-offs, and measurable business outcomes.",
                "Lead with your high-level thesis before elaborating on supporting details.",
            ],
            insight: "Coach Insight: Structured communication separates top-tier candidates across all domains.",
            actions: [
                { label: "Practice Interview Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    }

    // Item 3: Session Report Actionable Insight or Role Execution Tip
    let feedbackItem: ChatDmItem;
    if (lastFeedback) {
        feedbackItem = {
            id: "coach-feedback",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Yesterday",
            isOnline: true,
            badgeLabel: lastFeedback.verdict || "Session Evaluation",
            messages: [
                `Overall Assessment (${lastFeedback.verdict} · ${lastFeedback.overallScore}/100): ${lastFeedback.summary}`,
                lastFeedback.improvements?.[0]
                    ? `Priority Focus: ${lastFeedback.improvements[0].title} — ${lastFeedback.improvements[0].recommendation}`
                    : (lastFeedback.quickTips?.[0] || "Practice another mock session to build muscle memory.")
            ],
            insight: lastFeedback.quickTips?.[1] ? `Coach Tip: ${lastFeedback.quickTips[1]}` : undefined,
            actions: [
                { label: "Practice Next Drill", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    } else {
        feedbackItem = {
            id: "coach-feedback",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Yesterday",
            isOnline: true,
            badgeLabel: family === "product_manager" ? "Execution & Prioritization" : "Interview Execution",
            messages: [
                family === "product_manager"
                    ? "In ambiguous PM scenario questions, clarify the business goal upfront (acquisition vs retention vs monetization) before proposing product features."
                    : "Practice answering under timed conditions and proactively state your assumptions before formulating a complete solution."
            ],
            actions: [
                { label: "Practice Live Mock", primary: true, icon: Play, onClick: onPractice },
            ]
        };
    }

    const coachProfile: CharacterProfile = {
        id: "coach",
        name: "Interview Coach",
        role: "Technical & Behavioral Assessment",
        roleExplanation: coachExplanation,
        avatar: COACH_AVATAR,
        unreadCount: lastFeedback ? 3 : 2,
        items: [starItem, domainItem, feedbackItem],
    };

    // ─────────────────────────────────────────────────────────────
    // 2. RECRUITER: Role-Specific Opportunities & Live Matched Jobs
    // ─────────────────────────────────────────────────────────────
    const recruiterItems: ChatDmItem[] = [];

    // Prioritize actual live matched jobs for this role from displayedJobs
    if (displayedJobs && displayedJobs.length > 0) {
        displayedJobs.slice(0, 2).forEach((job, idx) => {
            recruiterItems.push({
                id: `rec-job-${job.id || idx}`,
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: idx === 0 ? "10m ago" : "2h ago",
                isOnline: true,
                badgeLabel: `${job.company} Simulation`,
                messages: [
                    `I matched your profile for ${displayRole} with an active role at ${job.company}: **${cleanJobTitle(job.title)}** (${job.location}).`,
                    `Hiring teams at ${job.company} evaluate candidates against their specific ${displayRole} hiring rubric. Practice their interview round to benchmark your readiness.`,
                ],
                insight: `Recruiter Insight: Candidates who practice ${job.company}'s specific interview format score 45% higher`,
                actions: [
                    { label: `Practice ${job.company} Interview`, primary: true, icon: Play, onClick: onPractice },
                    ...(onOpenJob ? [{ label: "View Role", icon: ArrowRight, onClick: () => onOpenJob(job) }] : []),
                ]
            });
        });
    }

    // Role-specific company simulations for remaining slots
    if (family === "product_manager") {
        if (!recruiterItems.some(item => item.badgeLabel?.includes("Stripe"))) {
            recruiterItems.push({
                id: "rec-stripe-pm",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3h ago",
                isOnline: true,
                badgeLabel: "Stripe PM Simulation",
                messages: [
                    "I reviewed your target profile for Product Management at Stripe. Hiring managers look for API product strategy, developer ecosystem intuition, and platform roadmap execution.",
                    "Practice Stripe's actual Product Management interview round to master their hiring rubric.",
                ],
                insight: "Recruiter Insight: Candidates who practice company-specific rounds score 45% higher",
                actions: [
                    { label: "Practice Stripe PM Interview", primary: true, icon: Play, onClick: onPractice },
                ]
            });
        }
        if (!recruiterItems.some(item => item.badgeLabel?.includes("Linear"))) {
            recruiterItems.push({
                id: "rec-linear-pm",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "Yesterday",
                isOnline: true,
                badgeLabel: "Linear PM Simulation",
                messages: [
                    "Linear is hiring a Product Lead for core collaboration and issue tracking workflows. Their round tests product craft, scope shaping, and customer empathy.",
                    "Start a simulated Linear product round to practice their exact interview bar.",
                ],
                actions: [
                    { label: "Practice Linear PM Interview", primary: true, icon: Play, onClick: onPractice },
                ]
            });
        }
        if (!recruiterItems.some(item => item.badgeLabel?.includes("OpenAI"))) {
            recruiterItems.push({
                id: "rec-openai-pm",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "2d ago",
                isOnline: true,
                badgeLabel: "OpenAI PM Simulation",
                messages: [
                    "OpenAI has an open Product Manager role for AI developer tools and model platform APIs.",
                    "Test your product vision and technical feasibility trade-offs in OpenAI's mock round.",
                ],
                insight: "Recruiter Tip: Demonstrating clear understanding of API workflows anchors your senior PM candidacy",
                actions: [
                    { label: "Practice OpenAI PM Interview", primary: true, icon: Play, onClick: onPractice },
                ]
            });
        }
        if (!recruiterItems.some(item => item.badgeLabel?.includes("Notion"))) {
            recruiterItems.push({
                id: "rec-notion-pm",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3d ago",
                isOnline: true,
                badgeLabel: "Notion PM Simulation",
                messages: [
                    "Notion is hiring Product Managers for workplace collaboration and productivity systems. Test your product execution and user adoption strategies in their mock round.",
                ],
                actions: [
                    { label: "Practice Notion PM Interview", primary: true, icon: Play, onClick: onPractice },
                ]
            });
        }
    } else if (family === "product_designer") {
        recruiterItems.push(
            {
                id: "rec-figma-des",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3h ago",
                isOnline: true,
                badgeLabel: "Figma Design Simulation",
                messages: [
                    "Figma is hiring Senior Product Designers. Their interview evaluates systems thinking, component architecture, and interaction polish.",
                    "Run a practice Figma product design critique to benchmark your design portfolio.",
                ],
                actions: [{ label: "Practice Figma Design Interview", primary: true, icon: Play, onClick: onPractice }]
            },
            {
                id: "rec-stripe-des",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "Yesterday",
                isOnline: true,
                badgeLabel: "Stripe Design Simulation",
                messages: [
                    "Stripe is hiring Product Designers for checkout flows and developer dashboards. Hiring managers look for deep UX craft and complex data visualization.",
                ],
                actions: [{ label: "Practice Stripe Design Interview", primary: true, icon: Play, onClick: onPractice }]
            }
        );
    } else if (family === "data_analyst") {
        recruiterItems.push(
            {
                id: "rec-doordash-da",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3h ago",
                isOnline: true,
                badgeLabel: "DoorDash Analytics Simulation",
                messages: [
                    "DoorDash is hiring Product Data Analysts for marketplace logistics and delivery conversion funnels.",
                    "Practice DoorDash's quantitative case study and SQL metric evaluation round.",
                ],
                actions: [{ label: "Practice DoorDash Analytics Interview", primary: true, icon: Play, onClick: onPractice }]
            },
            {
                id: "rec-stripe-da",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "Yesterday",
                isOnline: true,
                badgeLabel: "Stripe Analytics Simulation",
                messages: [
                    "Stripe is hiring Data & Analytics Engineers to model payment fraud prevention and merchant revenue growth.",
                ],
                actions: [{ label: "Practice Stripe Analytics Interview", primary: true, icon: Play, onClick: onPractice }]
            }
        );
    } else if (family === "frontend_developer") {
        recruiterItems.push(
            {
                id: "rec-vercel-fe",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3h ago",
                isOnline: true,
                badgeLabel: "Vercel Frontend Simulation",
                messages: [
                    "Vercel is hiring Senior Frontend Engineers specializing in Next.js, React Server Components, and Web Vitals.",
                    "Practice Vercel's live frontend architecture interview round.",
                ],
                actions: [{ label: "Practice Vercel Frontend Interview", primary: true, icon: Play, onClick: onPractice }]
            },
            {
                id: "rec-linear-fe",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "Yesterday",
                isOnline: true,
                badgeLabel: "Linear Frontend Simulation",
                messages: [
                    "Linear is hiring Frontend Engineers to build ultra-fast, 60fps web application experiences.",
                ],
                actions: [{ label: "Practice Linear Frontend Interview", primary: true, icon: Play, onClick: onPractice }]
            }
        );
    } else {
        // Backend / General
        recruiterItems.push(
            {
                id: "rec-stripe-swe",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "3h ago",
                isOnline: true,
                badgeLabel: "Stripe Simulation",
                messages: [
                    "I reviewed your target profile for Engineering roles at Stripe. Hiring managers look for distributed system reliability and API execution.",
                    "Practice the technical interview round at Stripe to master their real hiring rubric.",
                ],
                actions: [{ label: "Practice Stripe Interview", primary: true, icon: Play, onClick: onPractice }]
            },
            {
                id: "rec-linear-swe",
                sender: "Recruiter",
                avatar: RECRUITER_AVATAR,
                time: "Yesterday",
                isOnline: true,
                badgeLabel: "Linear Simulation",
                messages: [
                    "Linear is actively hiring Systems Engineers. Their round focuses on real-time sync architecture, distributed services, and WebSockets.",
                ],
                actions: [{ label: "Practice Linear Interview", primary: true, icon: Play, onClick: onPractice }]
            }
        );
    }

    const recruiterProfile: CharacterProfile = {
        id: "recruiter",
        name: "Recruiter",
        role: "Company Interview Simulation & Referrals",
        roleExplanation: "I match you with open career trajectory roles at top companies and simulate their specific live interview rounds.",
        avatar: RECRUITER_AVATAR,
        unreadCount: recruiterItems.length,
        items: recruiterItems.slice(0, 4),
    };

    return [coachProfile, recruiterProfile];
}

// Fallback static export for backwards compatibility
export const CHARACTERS: CharacterProfile[] = buildCharactersForUser();

