import { ArrowDown, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
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
    // 1. INTERVIEW COACH: Accurate STAR Assessment + Role Domain
    // ─────────────────────────────────────────────────────────────
    const coachExplanation =
        family === "ui_designer"
            ? "I analyze your responses, coach you on visual craft & design systems, and drill you on typography, micro-interactions & dev handoff."
            : family === "product_manager"
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
            badgeLabel: "Welcome to Get Prepped",
            messages: [
                `Welcome to Get Prepped, ${displayRole} — I'm your Interview Coach, here to help you ace your next interview.`,
                `Upload your resume to get an ATS audit, or start a mock interview to get personalized STAR and domain coaching. When you're ready for targeted product sense tips, your coach will share them here.`,
            ],
            insight: `Structure each behavioral response by separating the problem context from your direct actions, then anchor with a measurable outcome.`,
            actions: [
                { label: hasInterview ? "Practice Next Round" : "Start Mock Interview", primary: true, onClick: onPractice },
                { label: "View STAR Guide", icon: ArrowDown, onClick: onPractice },
            ],
        };
    }

    // Item 1: STAR Structure
    let starItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        const starScore = typeof lastFeedback.metrics?.structureStar === "number" ? lastFeedback.metrics.structureStar : 60;
        const starImprovement = lastFeedback.improvements?.find(imp =>
            /star|structure|situation|action|result|metric|quantif/i.test(imp.title + " " + imp.detail)
        );
        const starLlmInsight = starImprovement?.recommendation
            || lastFeedback.improvements?.find(i => /action|result|metric/i.test(i.title + " " + i.detail))?.recommendation
            || (lastFeedback.quickTips && lastFeedback.quickTips.length > 0 ? lastFeedback.quickTips[0] : null)
            || (starScore < 65
                ? "Delineate your specific personal actions from high-level team context, and conclude with the measurable business result."
                : starScore < 78
                ? "Conclude your behavioral stories with concrete business metrics rather than high-level operational descriptions."
                : "Maintain concise delivery under 2.5 minutes while linking specific personal decisions directly to team and product success.");

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
                insight: starLlmInsight,
                actions: [
                    { label: "Practice STAR Drill", primary: true, disabled: true },
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
                insight: starLlmInsight,
                actions: [
                    { label: "Practice STAR Drill", primary: true, disabled: true },
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
                insight: starLlmInsight,
                actions: [
                    { label: "Practice STAR Drill", primary: true, disabled: true },
                ]
            };
        }
    } else {
        starItem = {
            id: "coach-star",
            sender: "Interview Coach",
            avatar: COACH_AVATAR,
            time: "1h ago",
            isOnline: true,
            badgeLabel: "STAR Behavioral Coaching",
            messages: [
                `In behavioral interview rounds for ${displayRole}, structure your responses using the STAR method: Situation (15%), Task (15%), Action (50%), and measurable Result (20%).`,
                "Focus on your individual contributions, personal ownership, and quantify your outcomes with metrics (e.g. % improvement or delivery speed).",
            ],
            insight: `Allocate 50% of your response time to the specific actions YOU took, and conclude with concrete metric outcomes.`,
            actions: [
                { label: "Practice STAR Drill", primary: true, disabled: true },
            ],
        };
    }

    // Item 2: Domain-Specific Assessment
    let domainItem: ChatDmItem | null = null;
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
                insight: "Articulate the root customer problem and validation criteria before proposing feature architecture.",
                actions: [
                    { label: "Practice Product Sense Drill", primary: true, onClick: onPractice },
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
                insight: "Walk through user pain points and edge cases before presenting final high-fidelity screens.",
                actions: [
                    { label: "Practice Design System Drill", primary: true, onClick: onPractice },
                ]
            };
        } else if (family === "ui_designer") {
            domainItem = {
                id: "coach-domain",
                sender: "Interview Coach",
                avatar: COACH_AVATAR,
                time: "1h ago",
                isOnline: true,
                badgeLabel: "UI Craft & Design Systems",
                messages: [
                    "For UI Designer interviews, emphasize component reusability, tokenized color and spacing systems, and micro-interaction states.",
                    "Review responsive breakpoint mechanics, accessible contrast ratios, and design-to-code handoff documentation before your next session.",
                ],
                insight: "Demonstrate component hierarchy, accessible color contrast, and fluid transition states across screen sizes.",
                actions: [
                    { label: "Practice UI Design Drill", primary: true, onClick: onPractice },
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
                insight: "Formulate clear hypotheses and statistical significance thresholds before diving into data exploration.",
                actions: [
                    { label: "Practice Analytics Metric Drill", primary: true, onClick: onPractice },
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
                insight: "Address DOM performance, client-side caching boundaries, and Core Web Vitals optimization.",
                actions: [
                    { label: "Practice Frontend Drill", primary: true, onClick: onPractice },
                ]
            };
        } else if (family === "devops_sre") {
            domainItem = {
                id: "coach-domain",
                sender: "Interview Coach",
                avatar: COACH_AVATAR,
                time: "1h ago",
                isOnline: true,
                badgeLabel: "Infrastructure & Reliability",
                messages: [
                    "For DevOps and SRE interviews, focus on multi-region failover, Kubernetes ingress architecture, and CI/CD canary deployment strategies.",
                    "Review Prometheus metrics, error budget tracking, and Terraform infrastructure-as-code patterns before your next session.",
                ],
                insight: "Articulate MTTR reduction targets, canary rollback mechanisms, and SLO error budget policies.",
                actions: [
                    { label: "Practice SRE & DevOps Drill", primary: true, onClick: onPractice },
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
                insight: "Address cache invalidation guarantees, data partitioning strategies, and latency percentiles.",
                actions: [
                    { label: "Practice System Design Drill", primary: true, onClick: onPractice },
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
                insight: "Lead with a structured thesis and quantify outcomes with measurable impact metrics.",
                actions: [
                    { label: "Practice Interview Drill", primary: true, onClick: onPractice },
                ]
            };
        }

    // Item 3: Session Feedback Message — only after an interview
    let feedbackItem: ChatDmItem | null = null;
    if (hasInterview && lastFeedback) {
        const sessionLlmInsight = (lastFeedback.quickTips && lastFeedback.quickTips.length > 0 ? lastFeedback.quickTips[0] : null)
            || (lastFeedback.improvements && lastFeedback.improvements.length > 0 ? `${lastFeedback.improvements[0].title}: ${lastFeedback.improvements[0].recommendation}` : null)
            || lastFeedback.summary
            || "Review your feedback report to study recognized strengths, areas for improvement, and model responses.";

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
            insight: sessionLlmInsight,
            actions: [
                {
                    label: "View Feedback Report",
                    primary: true,
                    icon: ArrowUpRight,
                    onClick: onOpenFeedback,
                },
                {
                    label: "Practice Next Round",
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
        const resumeLlmInsight = (fb.suggestions && fb.suggestions.length > 0 ? (fb.suggestions[0].recommendation || fb.suggestions[0].feedback) : null)
            || (Array.isArray(fb.improvements) && fb.improvements.length > 0
                ? (typeof fb.improvements[0] === "string" ? fb.improvements[0] : (fb.improvements[0] as any)?.recommendation || (fb.improvements[0] as any)?.detail)
                : null)
            || (fb.missingKeywords && fb.missingKeywords.length > 0
                ? `Incorporate high-signal keywords for ${role}: ${fb.missingKeywords.slice(0, 4).join(", ")}.`
                : null)
            || "Elevate bullet points with the formula: Accomplished [X], as measured by [Y], by doing [Z].";

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
            insight: resumeLlmInsight,
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

    // Fallback CV audit prompt if no resume uploaded yet
    const resumePromptItem: ChatDmItem = {
        id: "coach-resume-audit-prompt",
        sender: "Interview Coach",
        avatar: COACH_AVATAR,
        time: "Just now",
        isOnline: true,
        badgeLabel: "CV Optimization Audit",
        messages: [
            `Upload your resume in Settings to receive an instant ATS audit and role alignment score for ${displayRole}.`,
            `We evaluate your impact metrics, keywords, and action verbs against hiring standards and provide in-line improvements.`,
        ],
        insight: `Upload your resume in Settings to receive an automated ATS audit and targeted keyword analysis for ${displayRole}.`,
        actions: [
            {
                label: "Upload Resume in Settings",
                primary: true,
                icon: ArrowUpRight,
                onClick: () => onOpenResumeFeedback?.(),
            },
        ],
    };

    // Item 5: Role Simulation Readiness Drill
    const simulationItem: ChatDmItem = {
        id: "coach-simulation-drill",
        sender: "Interview Coach",
        avatar: COACH_AVATAR,
        time: "2h ago",
        isOnline: true,
        badgeLabel: `${displayRole} Readiness Drill`,
        messages: [
            `Ready to benchmark your ${displayRole} readiness? Practice simulated interview rounds calibrated to real tech and enterprise hiring bars.`,
            `Each round includes AI voice recruiter feedback, STAR rubric analysis, and personalized improvement coaching.`,
        ],
        insight: `Benchmark your readiness with live interview rounds calibrated to top tech hiring rubrics for ${displayRole}.`,
        actions: [
            { label: `Practice ${displayRole} Round`, primary: true, onClick: onPractice },
        ],
    };

    const coachItems: ChatDmItem[] = [];
    if (feedbackItem) coachItems.push(feedbackItem);
    if (welcomeItem) coachItems.push(welcomeItem);
    if (resumeFeedbackItems.length > 0) {
        coachItems.push(...resumeFeedbackItems);
    } else {
        coachItems.push(resumePromptItem);
    }
    if (starItem) coachItems.push(starItem);
    if (domainItem) coachItems.push(domainItem);
    coachItems.push(simulationItem);

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

