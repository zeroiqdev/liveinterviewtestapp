import { ArrowDown, ArrowRight, ArrowUpRight, Play } from "@phosphor-icons/react";
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

export interface InterviewRoundCard {
    id: string;
    number: string;
    title: string;
    tagline: string;
    image: string;
    icon: string;
    isTall?: boolean;
}

export function getInterviewRoundsForRole(userRole?: string, userRoleFamily?: string): InterviewRoundCard[] {
    const family = userRoleFamily || (userRole ? normalizeUserRoleFamily(userRole) : "engineering");

    if (family === "product_manager" || family === "product") {
        return [
            {
                id: "product-sense",
                number: "01",
                title: "Product Sense &\nStrategy",
                tagline: "Vision, Roadmap & Prioritization",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral",
                number: "02",
                title: "Behavioral &\nLeadership",
                tagline: "Influence & Conflict Resolution",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "execution-metrics",
                number: "03",
                title: "Execution &\nMetrics",
                tagline: "A/B Testing, Launch & KPI Analysis",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "user-experience",
                number: "04",
                title: "User Journey &\nDiscovery",
                tagline: "Customer Empathy & Wireframing",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "product_designer" || family === "design") {
        return [
            {
                id: "portfolio-critique",
                number: "01",
                title: "Portfolio Deep\nDive & Critique",
                tagline: "Case Studies & Problem Framing",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral",
                number: "02",
                title: "Design Leadership\n& Collaboration",
                tagline: "Stakeholder Alignment & Feedback",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "design-systems",
                number: "03",
                title: "Design Systems &\nInteraction",
                tagline: "UI Patterns, Tokens & Responsive",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "user-research",
                number: "04",
                title: "User Research &\nTesting",
                tagline: "Usability Testing & Synthesis",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "data_analyst" || family === "data_science" || family === "data") {
        return [
            {
                id: "sql-analytics",
                number: "01",
                title: "SQL & Analytics\nTechnical Drill",
                tagline: "Complex Queries, Joins & Windows",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
            {
                id: "behavioral",
                number: "02",
                title: "Behavioral &\nBusiness Impact",
                tagline: "Influencing with Data Insights",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "statistics-modeling",
                number: "03",
                title: "Statistical\nModeling & Case",
                tagline: "Experimentation & Causal Inference",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "data-storytelling",
                number: "04",
                title: "Data Storytelling\n& Dashboards",
                tagline: "Executive Metric Presentation",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
        ];
    }

    if (family === "operations" || family === "business" || family === "customer_service") {
        return [
            {
                id: "operational-strategy",
                number: "01",
                title: "Operational Strategy\n& Case Study",
                tagline: "Process Scaling & Optimization",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral",
                number: "02",
                title: "Behavioral &\nStakeholder Mgmt",
                tagline: "Crisis Escalation & Resolution",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "commercial-acumen",
                number: "03",
                title: "Commercial Acumen\n& Metrics",
                tagline: "Cost Efficiency & Resource Planning",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "execution-drills",
                number: "04",
                title: "Execution Drills\n& Root Cause",
                tagline: "Bottleneck Elimination & SLA Mgmt",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    // Default: Engineering (Frontend, Backend, Full Stack, SRE, Mobile, etc.)
    return [
        {
            id: "technical",
            number: "01",
            title: "Technical\nInterview",
            tagline: "Live Coding & Problem Solving",
            icon: "code",
            image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
        },
        {
            id: "behavioral",
            number: "02",
            title: "Behavioral\nInterview",
            tagline: "STAR Method & Leadership",
            icon: "chat",
            image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
            isTall: true,
        },
        {
            id: "system-design",
            number: "03",
            title: "System\nDesign",
            tagline: "Architecture & Scale",
            icon: "design",
            image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
        },
        {
            id: "skills-assessment",
            number: "04",
            title: "Skills\nAssessment",
            tagline: "Core Engineering Drills",
            icon: "play",
            image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
        },
    ];
}

// Module data for the hero cards (default fallback)
export const moduleCards = getInterviewRoundsForRole("Software Engineer", "engineering");

export const COACH_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485051/Screenshot_2026-07-31_at_7.49.46_AM_u6gpoz.png";
export const RECRUITER_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485049/Screenshot_2026-07-31_at_7.49.19_AM_qujtzo.png";

export interface ResumeScanSuggestion {
    category: string;
    feedback: string;
    recommendation: string;
}

export interface ResumeScanFeedbackItem {
    id?: string;
    resumeName?: string;
    fileName?: string;
    role?: string;
    domain?: string;
    resumeText?: string;
    score?: number | null;
    summary?: string;
    executiveSummary?: string;
    strengths?: string[];
    suggestions?: ResumeScanSuggestion[];
    improvements?: (string | ResumeScanSuggestion)[];
    missingKeywords?: string[];
    updatedAt?: string;
    metrics?: {
        impactScore?: number;
        roleAlignmentScore?: number;
        brevityScore?: number;
        structureScore?: number;
    };
}

export interface BuildCharactersOptions {
    userRole?: string;
    userRoleFamily?: string;
    displayedJobs?: JobItem[];
    lastFeedback?: FeedbackReportData | null;
    lastResumeFeedback?: ResumeScanFeedbackItem | null;
    allResumeFeedbacks?: ResumeScanFeedbackItem[] | null;
    hasAdminTips?: boolean;
    onPractice?: () => void;
    onOpenJob?: (job: JobItem) => void;
    onOpenFeedback?: () => void;
    onOpenResumeFeedback?: (resumeId?: string) => void;
}

export function buildCharactersForUser(opts: BuildCharactersOptions = {}): CharacterProfile[] {
    const {
        userRole,
        userRoleFamily,
        displayedJobs = [],
        lastFeedback,
        lastResumeFeedback,
        allResumeFeedbacks,
        onPractice,
        onOpenJob,
        onOpenFeedback,
        onOpenResumeFeedback,
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

    const hasInterview = !!lastFeedback;
    const hasAdminTips = !!(opts as any).hasAdminTips || (typeof window !== "undefined" && (localStorage.getItem("useladder_admin_tips_provided") === "true" || localStorage.getItem("adminTipsEnabled") === "true"));

    // Welcome item for new accounts (no interview yet)
    let welcomeItem: ChatDmItem | null = null;
    if (!hasInterview) {
        welcomeItem = {
            id: "coach-welcome",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Just now",
            isOnline: true,
            badgeLabel: "Welcome to UseLadder",
            messages: [
                `Welcome to UseLadder, ${displayRole} — I'm your Interview Coach, here to help you ace your next interview.`,
                `Upload your resume to get an ATS audit, or start a mock interview to get personalized STAR and domain coaching. When you're ready for targeted product sense tips, your coach will share them here.`,
            ],
            insight: "Coach Insight: Complete your profile and run one mock session to unlock your personalized coaching plan.",
            actions: [
                { label: hasInterview ? "Practice Next Round" : "Start Mock Interview", primary: true, icon: Play, onClick: onPractice },
                { label: "View STAR Guide", icon: ArrowDown, onClick: onPractice },
            ],
        };
    }

    // Item 1: STAR Structure — only after an interview
    let starItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        const starScore = typeof lastFeedback.metrics?.structureStar === "number" ? lastFeedback.metrics.structureStar : 60;
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
                    starImprovement ? `${starImprovement.detail} Next time: ${starImprovement.recommendation}` : `Your answers lacked clearly separated Actions and quantifiable Results. Structure each story: Situation (15%), Task (15%), specific personal Actions (50%), and measurable business impact (20%).`,
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
                    starImprovement ? `${starImprovement.detail} ${starImprovement.recommendation}` : `Your context setup was clear, but make sure each behavioral story concludes with concrete business metrics (e.g. 'improved retention by 14%' or 'reduced delivery cycle by 3 weeks').`,
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
    }

    // Item 2: Domain-Specific Assessment — only when admin has provided tips (per user request)
    let domainItem: ChatDmItem | null = null;
    if (hasAdminTips) {
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
    }

    // Item 3: Session Feedback Message — only after an interview
    let feedbackItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        feedbackItem = {
            id: "coach-interview-feedback",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Just now",
            isOnline: true,
            badgeLabel: `Evaluation Complete · ${lastFeedback.overallScore}/100`,
            messages: [
                `I've finished evaluating your latest interview session (${lastFeedback.verdict || "Strong Candidate"} · ${lastFeedback.overallScore}/100). ${lastFeedback.summary}`,
                "Your complete performance evaluation is ready with a detailed breakdown of your recognized strengths, areas to improve, your spoken quotes, and model answers.",
            ],
            insight: "Coach Insight: Reviewing your interview feedback within 24 hours improves offer conversion by 45%.",
            actions: [
                {
                    label: "View Feedback Report",
                    primary: true,
                    icon: ArrowUpRight,
                    onClick: onOpenFeedback,
                },
                {
                    label: "Practice Next Round",
                    icon: Play,
                    onClick: onPractice,
                },
            ],
        };
    }

    // Item 4: Resume / CV Audit Feedback DMs — one per uploaded resume (own thread), not overwriting the same message
    const resumeFeedbackItems: ChatDmItem[] = [];
    const sourceList = Array.isArray(allResumeFeedbacks) && allResumeFeedbacks.length > 0 ? allResumeFeedbacks : lastResumeFeedback ? [lastResumeFeedback] : [];
    // Most recent first, cap 10 to avoid spam
    sourceList.slice(0, 10).forEach((fb, idx) => {
        const score = typeof fb.score === "number" ? fb.score : 80;
        const name = fb.resumeName || (fb as any).fileName || "Uploaded Resume";
        const role = fb.role || displayRole;
        const summaryText = fb.summary || (fb as any).executiveSummary || `Your resume scored ${score}/100. We evaluated your impact metrics, role keywords, action verbs, and ATS formatting.`;
        const isLatest = idx === 0;
        // Use updatedAt for relative time if available
        let timeLabel = "Just now";
        try {
            if ((fb as any).updatedAt) {
                const d = new Date((fb as any).updatedAt);
                const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
                if (diffMin < 2) timeLabel = "Just now";
                else if (diffMin < 60) timeLabel = `${diffMin}m ago`;
                else if (diffMin < 1440) timeLabel = `${Math.floor(diffMin / 60)}h ago`;
                else timeLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            } else {
                timeLabel = isLatest ? "Just now" : `${idx + 1}h ago`;
            }
        } catch {}
        const fid = (fb as any).id || `resume-${idx}`;
        resumeFeedbackItems.push({
            id: `coach-resume-feedback-${fid}`,
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: timeLabel,
            isOnline: true,
            badgeLabel: `CV Audit Complete · ${score}/100`,
            messages: [
                `I finished auditing your resume (${name}) targeted for ${role}.`,
                summaryText,
                `Your full feedback report is ready with actionable suggestions and an in-line AI improver using the Google X-Y-Z formula.`,
            ],
            insight: "Coach Insight: Resumes that quantify achievements with the Google X-Y-Z formula get 3x more interview callbacks.",
            actions: [
                {
                    label: "Review Full CV Feedback & Improve In-Line",
                    primary: true,
                    icon: ArrowUpRight,
                    onClick: () => onOpenResumeFeedback?.(fid),
                },
            ],
        });
    });

    const coachItems: ChatDmItem[] = [];
    if (welcomeItem) coachItems.push(welcomeItem);
    if (resumeFeedbackItems.length > 0) {
        coachItems.push(...resumeFeedbackItems);
    }
    if (feedbackItem) coachItems.push(feedbackItem);
    if (starItem) coachItems.push(starItem);
    if (domainItem) coachItems.push(domainItem);

    const coachProfile: CharacterProfile = {
        id: "coach",
        name: "Interview Coach",
        role: "Technical & Behavioral Assessment",
        roleExplanation: coachExplanation,
        avatar: COACH_AVATAR,
        unreadCount: coachItems.length,
        items: coachItems,
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

