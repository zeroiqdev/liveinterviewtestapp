import { ArrowRight } from "@phosphor-icons/react";
import { actionForTopic, tipForWeek, type TipAction } from "@/lib/weeklyTips";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import type { JobItem } from "@/app/api/jobs/route";
import { isJobRoleMatch, normalizeUserRoleFamily } from "@/utils/locationDetector";
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
        disabled?: boolean;
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

    if (family === "ui_designer") {
        return [
            {
                id: "visual-ui-critique",
                number: "01",
                title: "Visual Design &\nUI Critique",
                tagline: "Layout, Typography & Visual Polish",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "design-systems",
                number: "02",
                title: "Design Systems &\nComponent Tokens",
                tagline: "Figma Variables, Atoms & States",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
                isTall: true,
            },
            {
                id: "interaction-micro",
                number: "03",
                title: "Interaction &\nMicro-Animations",
                tagline: "Transitions, Hover States & Delight",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
            {
                id: "dev-handoff",
                number: "04",
                title: "Design-to-Code\nHandoff & Collab",
                tagline: "Specs, Edge Cases & Implementation",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
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

    if (family === "virtual_assistant") {
        return [
            {
                id: "admin-organization",
                number: "01",
                title: "Administrative\nSupport & Organization",
                tagline: "Calendar, Inbox & Task Management",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral-va",
                number: "02",
                title: "Behavioral &\nCommunication",
                tagline: "Professionalism & Stakeholder Comms",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "tools-efficiency",
                number: "03",
                title: "Tools &\nEfficiency",
                tagline: "Productivity Stack & Automation",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "client-confidentiality",
                number: "04",
                title: "Client Relations &\nConfidentiality",
                tagline: "Executive Support & Trust",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "customer_service") {
        return [
            {
                id: "customer-interaction",
                number: "01",
                title: "Customer Interaction\n& Empathy",
                tagline: "Journey, Tone & De-escalation",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral-cs",
                number: "02",
                title: "Problem Resolution\n& De-escalation",
                tagline: "Crisis & SLA Management",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "product-support",
                number: "03",
                title: "Product Knowledge\n& Support Systems",
                tagline: "Tools, Macros & Knowledge Base",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "service-metrics",
                number: "04",
                title: "Service Metrics\n& Improvement",
                tagline: "CSAT, NPS & Process Ops",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "sales") {
        return [
            {
                id: "sales-discovery",
                number: "01",
                title: "Sales Discovery\n& Pitch",
                tagline: "Prospecting & Value Proposition",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "negotiation",
                number: "02",
                title: "Negotiation &\nObjection Handling",
                tagline: "Closing & Conflict Resolution",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "account-growth",
                number: "03",
                title: "Account Management\n& Growth",
                tagline: "Retention & Expansion",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "market-product",
                number: "04",
                title: "Market & Product\nKnowledge",
                tagline: "Industry & Competitive Insight",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "banking_finance") {
        return [
            {
                id: "financial-modeling",
                number: "01",
                title: "Financial Modeling\n& Valuation",
                tagline: "Excel, DCF & LBO",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "behavioral-banking",
                number: "02",
                title: "Behavioral &\nStakeholder Trust",
                tagline: "Ethics & Client Relations",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "risk-compliance",
                number: "03",
                title: "Risk & Compliance\nCase",
                tagline: "Regulation & Risk Assessment",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "market-analysis",
                number: "04",
                title: "Market Analysis\n& Reporting",
                tagline: "Macro, Sector & Earnings",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "oil_gas") {
        return [
            {
                id: "safety-operations",
                number: "01",
                title: "Technical Safety\n& Operations",
                tagline: "HSE, Equipment & Procedures",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "crew-leadership",
                number: "02",
                title: "Behavioral &\nCrew Leadership",
                tagline: "Team Coordination & Safety Culture",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "engineering-fundamentals",
                number: "03",
                title: "Engineering\nFundamentals",
                tagline: "Petroleum & Process Systems",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "field-operations",
                number: "04",
                title: "Field Operations\n& Troubleshooting",
                tagline: "On-Site Execution & Response",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "business_analyst") {
        return [
            {
                id: "ba-requirements",
                number: "01",
                title: "Business Analysis\n& Requirements",
                tagline: "Elicitation & Documentation",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "ba-stakeholder",
                number: "02",
                title: "Stakeholder\nManagement",
                tagline: "Alignment & Conflict Resolution",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "ba-modeling",
                number: "03",
                title: "Data Modeling &\nProcess Mapping",
                tagline: "UML, BPMN & Analytics",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "ba-evaluation",
                number: "04",
                title: "Solution Evaluation\n& Impact",
                tagline: "Feasibility & Benefit Assessment",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    if (family === "operations" || family === "business") {
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

    if (family === "devops_sre") {
        return [
            {
                id: "cloud-infrastructure",
                number: "01",
                title: "Cloud Infrastructure\n& Architecture",
                tagline: "Kubernetes, Terraform & AWS/GCP Design",
                icon: "design",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png",
            },
            {
                id: "sre-incident",
                number: "02",
                title: "Site Reliability &\nIncident Management",
                tagline: "SLO/SLA, Observability & Root Cause Analysis",
                icon: "chat",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786682354/f37d1ccf89f44a94d6effda08b05c8e2_laveh3.jpg",
                isTall: true,
            },
            {
                id: "cicd-automation",
                number: "03",
                title: "CI/CD &\nRelease Automation",
                tagline: "GitOps, Pipelines & Zero-Downtime Rollouts",
                icon: "play",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png",
            },
            {
                id: "security-linux",
                number: "04",
                title: "Linux Internals &\nCloud Security",
                tagline: "Networking, IAM & Infrastructure Hardening",
                icon: "code",
                image: "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png",
            },
        ];
    }

    // Default: Engineering (Frontend, Backend, Full Stack, Mobile, etc.)
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
    /** Which version of the review made it (see lib/resumeReviewVersion). */
    reviewVersion?: number;
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
    /** This week's and last week's approved tips for this user's role (from /api/weekly-tips). */
    weeklyTips?: Array<{ week: number; topic: string; title: string; body: string; tryThis: string; action?: TipAction }> | null;
    /** Opens the jobs board. */
    onOpenJobs?: () => void;
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
        weeklyTips,
        onPractice,
        onOpenJob,
        onOpenJobs,
        onOpenFeedback,
        onOpenResumeFeedback,
    } = opts;

    const family = userRoleFamily || (userRole ? normalizeUserRoleFamily(userRole) : "general");
    const displayRole = userRole || (
        family === "ui_designer" ? "UI Designer" :
        family === "product_manager" ? "Product Manager" :
        family === "product_designer" ? "Product Designer" :
        family === "data_analyst" ? "Data Analyst" :
        family === "frontend_developer" ? "Frontend Engineer" :
        family === "devops_sre" ? "DevOps / SRE Specialist" :
        family === "backend_engineer" ? "Software Engineer" :
        family === "virtual_assistant" ? "Virtual Assistant" :
        family === "customer_service" ? "Customer Service Representative" :
        family === "sales" ? "Sales & Business Development" :
        family === "banking_finance" ? "Banking & Finance Professional" :
        family === "oil_gas" ? "Oil & Gas Professional" :
        family === "business_analyst" ? "Business Analyst" : "Candidate"
    );

    // ─────────────────────────────────────────────────────────────
    // 1. INTERVIEW COACH
    //
    // A new account gets three short messages: a welcome, a nudge to add a
    // resume, and this week's tip. Advice about their answers and their role
    // only appears once they have done an interview, when it means something.
    // A new tip arrives every Monday (lib/weeklyTips) with its own id, so it
    // shows as unread without anything being published by hand.
    // ─────────────────────────────────────────────────────────────
    const coachExplanation = "I listen to your answers, tell you what to fix, and send you a new tip every week.";

    const hasInterview = !!lastFeedback;

    // Welcome, until the first interview is done.
    let welcomeItem: ChatDmItem | null = null;
    if (!hasInterview) {
        welcomeItem = {
            id: "coach-welcome",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Just now",
            isOnline: true,
            badgeLabel: "Welcome",
            messages: [
                `Welcome to get prepped. I'm your coach, and I'll help you get ready for ${displayRole} interviews.`,
                "The quickest way to start is to do one practice interview. It takes about 20 minutes, and afterwards I'll show you what went well and what to work on.",
            ],
            actions: [{ label: "Start my first interview", primary: true, onClick: onPractice }],
        };
    }

    // How they structured their answers, once there is an interview to judge.
    let starItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        const starScore = typeof lastFeedback.metrics?.structureStar === "number" ? lastFeedback.metrics.structureStar : 60;
        const starImprovement = lastFeedback.improvements?.find(imp =>
            /star|structure|situation|action|result|metric|quantif/i.test(imp.title + " " + imp.detail)
        );
        const nextStep = starImprovement?.recommendation
            || (starScore < 65
                ? "Spend most of each answer on what you did, and finish with what happened because of it."
                : starScore < 78
                ? "Finish each story with the result, with a number if you have one."
                : "Keep each answer under two and a half minutes.");
        starItem = {
            id: "coach-star",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "After your last interview",
            isOnline: true,
            badgeLabel: starScore < 65 ? "Your answers need clearer structure" : starScore < 78 ? "Your answers are nearly there" : "Your answers are well structured",
            messages: [
                starScore < 65
                    ? `In your last interview it was hard to follow what you did and what came of it (${starScore}/100 for structure).`
                    : starScore < 78
                    ? `In your last interview you set the scene well, but some answers stopped before the result (${starScore}/100 for structure).`
                    : `In your last interview your answers were easy to follow from start to finish (${starScore}/100 for structure).`,
                starImprovement ? starImprovement.detail : "A good answer has four parts: the situation, what you had to do, what you did, and what happened.",
            ],
            insight: nextStep,
            actions: [{ label: "Practise again", primary: true, onClick: onPractice }],
        };
    }

    // One thing interviewers look for in this kind of role, after the first interview.
    const ROLE_TIPS: Record<string, { label: string; tip: string; tryThis: string }> = {
        product_manager: { label: "Product interviews", tip: "Interviewers want to hear how you decided what to build and how you knew it worked. Name the problem, the options you weighed, and the number you watched.", tryThis: "For your best project, write down the one number that told you it was working." },
        product_designer: { label: "Design interviews", tip: "Walk through one project from the problem to the result. Say what you learned from users and what you changed because of it, not only what the screens looked like.", tryThis: "Pick one project and prepare the story of a decision you changed after testing." },
        ui_designer: { label: "Design interviews", tip: "Be ready to explain why a screen looks the way it does: the spacing, the type, the states. Interviewers are listening for decisions, not taste.", tryThis: "Choose one screen you designed and practise explaining three decisions in it." },
        data_analyst: { label: "Data interviews", tip: "Say what question you were answering before you describe the analysis, and end with what the business did because of it.", tryThis: "For one analysis, practise explaining the finding to someone who doesn't work with data." },
        frontend_developer: { label: "Engineering interviews", tip: "Explain the trade-off behind a technical choice: what you gained, what you gave up, and how you would know if it was the wrong call.", tryThis: "Prepare one story about a performance problem you found and fixed." },
        backend_engineer: { label: "Engineering interviews", tip: "Explain the trade-off behind a technical choice: what you gained, what you gave up, and how you would know if it was the wrong call.", tryThis: "Prepare one story about a system that broke and what you changed afterwards." },
        devops_sre: { label: "Engineering interviews", tip: "Tell incident stories in order: what broke, how you found it, how you fixed it, and what you changed so it would not happen again.", tryThis: "Write down your best incident story in those four steps." },
        customer_service: { label: "Customer service interviews", tip: "Interviewers want to hear how you stay calm with an upset customer. Describe what the customer said, what you said back, and how it ended.", tryThis: "Prepare one story about a customer you turned around." },
        sales: { label: "Sales interviews", tip: "Talk in numbers: your target, what you hit, and how. Then describe one deal from first contact to close, including the objection you had to get past.", tryThis: "Write down your last three targets and what you achieved against each." },
        banking_finance: { label: "Banking and finance interviews", tip: "Accuracy and judgement matter most. Describe a time you caught a mistake or a risk, what you did, and who you told.", tryThis: "Prepare one story about an error you caught before it caused a problem." },
        virtual_assistant: { label: "Assistant interviews", tip: "Show that you can be trusted to run things without being chased. Describe how you keep track of tasks and what you do when two things are urgent at once.", tryThis: "Prepare one story about a week when everything was due at once." },
        oil_gas: { label: "Oil and gas interviews", tip: "Safety comes first in every answer. When you describe a job, say what the risk was and what you did to control it before you talk about the result.", tryThis: "Prepare one story about a time you stopped a job or raised a safety concern." },
        business_analyst: { label: "Business analysis interviews", tip: "Describe how you found out what people actually needed, which is often different from what they first asked for, and how you got agreement.", tryThis: "Prepare one story about a requirement that changed once you asked more questions." },
    };
    let domainItem: ChatDmItem | null = null;
    if (hasInterview) {
        const roleTip = ROLE_TIPS[family] ?? { label: "Interviews for your role", tip: "Give your answer first, then the detail. Interviewers follow you more easily when they know where you are going.", tryThis: "Practise starting each answer with a one-sentence summary." };
        domainItem = {
            id: "coach-domain",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "For your role",
            isOnline: true,
            badgeLabel: roleTip.label,
            messages: [roleTip.tip],
            insight: roleTip.tryThis,
            actions: [{ label: "Practise this", primary: true, onClick: onPractice }],
        };
    }

    // The latest interview's result.
    let feedbackItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        const sessionInsight = (lastFeedback.quickTips && lastFeedback.quickTips.length > 0 ? lastFeedback.quickTips[0] : null)
            || (lastFeedback.improvements && lastFeedback.improvements.length > 0 ? `${lastFeedback.improvements[0].title}: ${lastFeedback.improvements[0].recommendation}` : null)
            || undefined;

        feedbackItem = {
            id: "coach-interview-feedback",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "Just now",
            isOnline: true,
            badgeLabel: `Your interview · ${lastFeedback.overallScore}/100`,
            messages: [
                `I've gone through your last interview. You scored ${lastFeedback.overallScore} out of 100. ${lastFeedback.summary || ""}`.trim(),
                "Your report shows what you did well, what to work on, and better ways to answer the questions you found hard.",
            ],
            insight: sessionInsight,
            actions: [
                { label: "Open my report", primary: true, onClick: onOpenFeedback },
                { label: "Practise again", onClick: onPractice },
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
        const summaryText = fb.summary || (fb as any).executiveSummary || `Your resume scored ${score} out of 100. I looked at how clearly it shows your results, whether it uses the words employers search for, and how easy it is to read.`;
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
        const resumeLlmInsight = (fb.suggestions && fb.suggestions.length > 0 ? (fb.suggestions[0].recommendation || fb.suggestions[0].feedback) : null)
            || (Array.isArray(fb.improvements) && fb.improvements.length > 0
                ? (typeof fb.improvements[0] === "string" ? fb.improvements[0] : (fb.improvements[0] as any)?.recommendation || (fb.improvements[0] as any)?.detail)
                : null)
            || (fb.missingKeywords && fb.missingKeywords.length > 0
                ? `Add these words where they are true for you: ${fb.missingKeywords.slice(0, 4).join(", ")}.`
                : null)
            || "Start each line with the result, then say how you got it.";

        resumeFeedbackItems.push({
            id: `coach-resume-feedback-${fid}`,
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: timeLabel,
            isOnline: true,
            badgeLabel: `Resume review · ${score}/100`,
            messages: [
                `I've gone through your resume (${name}) for ${role} roles.`,
                summaryText,
                `The full review shows what to change, line by line, and you can edit it there.`,
            ],
            insight: resumeLlmInsight,
            actions: [
                {
                    label: "Open my resume review",
                    primary: true,
                    onClick: () => onOpenResumeFeedback?.(fid),
                },
            ],
        });
    });

    // A nudge to add a resume, until one has been reviewed.
    const resumePromptItem: ChatDmItem = {
        id: "coach-resume-audit-prompt",
        sender: "Interview Coach",
        avatar: COACH_AVATAR,
        time: "Just now",
        isOnline: true,
        badgeLabel: "Add your resume",
        messages: [
            "If you add your resume, I'll tell you how it reads to an employer and what to change. Your interviews will also ask about your own experience.",
            "It's optional, and you can add it whenever you like.",
        ],
        actions: [{ label: "Add my resume", primary: true, onClick: () => onOpenResumeFeedback?.() }],
    };

    // This week's tip, with last week's kept underneath it.
    // The approved tips for their role arrive a moment after the page loads;
    // until then (or if that fails) the fixed tip for the week stands in.
    const tipActions: Record<TipAction, ChatDmItem["actions"]> = {
        jobs: [{ label: "Find jobs to apply for", primary: true, onClick: onOpenJobs }],
        practice: [{ label: "Practise this now", primary: true, onClick: onPractice }],
        resume: [{ label: "Work on my resume", primary: true, onClick: () => onOpenResumeFeedback?.() }],
        none: undefined,
    };
    const weeklyTipItems: ChatDmItem[] = [0, 1].map((weeksAgo) => {
        const tip = weeklyTips?.[weeksAgo] ?? tipForWeek(new Date(), weeksAgo);
        return {
            id: `coach-tip-week-${tip.week}`,
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: weeksAgo === 0 ? "This week" : "Last week",
            isOnline: true,
            badgeLabel: `Weekly tip · ${tip.topic}`,
            messages: [tip.title, tip.body],
            insight: tip.tryThis,
            // What the tip asks them to do, one tap away.
            actions: tipActions[tip.action ?? actionForTopic(tip.topic)],
        };
    });

    // Newest and most personal first. A new account sees the welcome, the
    // resume nudge and this week's tip; nothing else until there is an interview.
    const coachItems: ChatDmItem[] = [];
    if (feedbackItem) coachItems.push(feedbackItem);
    if (welcomeItem) coachItems.push(welcomeItem);
    if (resumeFeedbackItems.length > 0) coachItems.push(...resumeFeedbackItems);
    else coachItems.push(resumePromptItem);
    coachItems.push(weeklyTipItems[0]);
    if (starItem) coachItems.push(starItem);
    if (domainItem) coachItems.push(domainItem);
    // Last week's tip only once they've been around long enough to have had it.
    if (hasInterview) coachItems.push(weeklyTipItems[1]);

    const coachProfile: CharacterProfile = {
        id: "coach",
        name: "Interview Coach",
        role: "Feedback and weekly tips",
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
                insight: `Hiring managers at ${job.company} evaluate role depth through concrete problem-solving stories.`,
                actions: [
                    { label: `Practice ${job.company} Interview`, primary: true, onClick: onPractice },
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
                insight: "Review Stripe's developer API philosophy and infrastructure reliability principles before your interview.",
                actions: [
                    { label: "Practice Stripe PM Interview", primary: true, onClick: onPractice },
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
                    { label: "Practice Linear PM Interview", primary: true, onClick: onPractice },
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
                insight: "Demonstrating clear understanding of model API workflows anchors your senior PM candidacy.",
                actions: [
                    { label: "Practice OpenAI PM Interview", primary: true, onClick: onPractice },
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
                    { label: "Practice Notion PM Interview", primary: true, onClick: onPractice },
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
                actions: [{ label: "Practice Figma Design Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Stripe Design Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice DoorDash Analytics Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Stripe Analytics Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Vercel Frontend Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Linear Frontend Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Stripe Interview", primary: true, onClick: onPractice }]
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
                actions: [{ label: "Practice Linear Interview", primary: true, onClick: onPractice }]
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
        items: recruiterItems.slice(0, 5),
    };

    return [coachProfile, recruiterProfile];
}

// Fallback static export for backwards compatibility
export const CHARACTERS: CharacterProfile[] = buildCharactersForUser();

