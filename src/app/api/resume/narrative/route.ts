import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

export interface RecruiterPerception {
    headline: string;
    perceptionSummary: string;
    perceivedSeniority: string;
    strengthsSeenByRecruiter: string[];
    potentialHesitations: string[];
}

export interface ResumeSectionEdit {
    sectionId: "headline" | "summary" | "experience" | "skills" | "projects";
    sectionTitle: string;
    originalContent: string;
    tailoredContent: string;
    recruiterRationale: string;
    suggestions: string[];
}

export interface CareerNarrativeResult {
    templateId: string;
    templateTitle: string;
    targetRole: string;
    recruiterPerception: RecruiterPerception;
    strategicReframingAngle: string;
    sections: ResumeSectionEdit[];
}

const NARRATIVE_SYSTEM_PROMPT = `You are a Principal Technical Recruiter and Career Narrative Architect who has placed hundreds of top candidates at Tier-1 tech companies, venture-backed startups, and global enterprises.

Your goal is twofold:
1. Provide an honest, objective breakdown of "How Recruiters View This Candidate's Career" based on their current resume. Explain their perceived persona, clear strengths, and subtle hesitations or blind spots a hiring manager might have.
2. Reframe the candidate's career narrative section-by-section to fit their chosen TARGET POSITIONING TEMPLATE (e.g. Technical Product Manager vs. Core/Growth Product Manager, or SRE / Infrastructure Engineer vs. Product / Full-Stack Engineer).

CRITICAL INSTRUCTIONS:
- Directly address the candidate ("You are perceived as...", "Your experience highlights...").
- For each section (headline, professional summary, key experience bullets, skills, notable projects), provide the original baseline text (or a extracted representation if missing) AND an actionable, highly tailored rewritten version that elevates their positioning for the selected template.
- Explain the "recruiterRationale": Why this rewrite positions them favorably to pass ATS screens and impress hiring leaders.

Return a JSON object with this exact structure:
{
  "templateId": "<string, e.g. 'technical_pm'>",
  "templateTitle": "<string, e.g. 'Technical Product Manager (Systems & Platform)'>",
  "targetRole": "<string>",
  "recruiterPerception": {
    "headline": "<1-sentence punchy summary of candidate's perceived career archetype>",
    "perceptionSummary": "<3-4 sentence comprehensive breakdown of what hiring managers and recruiters think when glancing at this CV for 30 seconds>",
    "perceivedSeniority": "<e.g. 'Mid-Level transitioning to Senior' or 'Senior Individual Contributor'>",
    "strengthsSeenByRecruiter": [
      "<Strength 1>",
      "<Strength 2>",
      "<Strength 3>"
    ],
    "potentialHesitations": [
      "<Hesitation or perceived gap 1>",
      "<Hesitation or perceived gap 2>"
    ]
  },
  "strategicReframingAngle": "<2-3 sentence strategic advice on what narrative pivot to emphasize (e.g. emphasize scale and tradeoffs instead of pure feature delivery)>",
  "sections": [
    {
      "sectionId": "headline",
      "sectionTitle": "Profile Headline & Title",
      "originalContent": "<Extracted or derived original headline>",
      "tailoredContent": "<Tailored rewrite for target template>",
      "recruiterRationale": "<Why this positioning captures recruiter attention>",
      "suggestions": ["<Actionable tip 1>", "<Actionable tip 2>"]
    },
    {
      "sectionId": "summary",
      "sectionTitle": "Professional Summary & Narrative",
      "originalContent": "<Extracted summary or placeholder>",
      "tailoredContent": "<Reframed high-impact 3-4 sentence narrative>",
      "recruiterRationale": "<Why this narrative reframes their trajectory>",
      "suggestions": ["<Actionable tip 1>", "<Actionable tip 2>"]
    },
    {
      "sectionId": "experience",
      "sectionTitle": "Work Experience & Achievement Bullets",
      "originalContent": "<Sample original experience bullets from CV>",
      "tailoredContent": "<Reframed impact bullets with strong action verbs, quantifiable metrics, and template-aligned keywords>",
      "recruiterRationale": "<Why this shifts the focus to high-leverage outcomes>",
      "suggestions": ["<Actionable tip 1>", "<Actionable tip 2>"]
    },
    {
      "sectionId": "skills",
      "sectionTitle": "Core Competencies & Keywords",
      "originalContent": "<Original skills list>",
      "tailoredContent": "<Curated, categorized skill hierarchy prioritized for this specific template>",
      "recruiterRationale": "<How this optimizes ATS match and recruiter keyword skimming>",
      "suggestions": ["<Actionable tip 1>"]
    },
    {
      "sectionId": "projects",
      "sectionTitle": "Key Projects & Case Studies",
      "originalContent": "<Derived project points>",
      "tailoredContent": "<Reframed project stories highlighting leadership, problem discovery, and measurable impact>",
      "recruiterRationale": "<How this proves real-world capability in the targeted direction>",
      "suggestions": ["<Actionable tip 1>"]
    }
  ]
}`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            resumeText,
            currentRole = "Software Engineer",
            targetRole = "Software Engineer",
            templateId = "technical_pm",
            customInstruction = "",
        } = body;

        const effectiveText = typeof resumeText === "string" && resumeText.trim().length > 30
            ? resumeText.trim().slice(0, 8000)
            : `Candidate specializing in ${currentRole}. Extensive background delivering projects, building features, and collaborating across teams. Aiming to reframe career narrative towards ${targetRole}.`;

        const prompt = `CURRENT ROLE: ${currentRole}
TARGET ROLE: ${targetRole}
SELECTED POSITIONING TEMPLATE: ${templateId}
ADDITIONAL GUIDANCE: ${customInstruction || "Optimize for impact, executive clarity, and tailored keyword relevance."}

CANDIDATE RESUME TEXT:
${effectiveText}`;

        const fallbackData: CareerNarrativeResult = {
            templateId,
            templateTitle: templateId.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            targetRole,
            recruiterPerception: {
                headline: `Experienced ${currentRole} with strong execution track record`,
                perceptionSummary: `Recruiters currently perceive you as a highly capable, hands-on practitioner with proven delivery ability in ${currentRole}. However, your current resume focuses heavily on day-to-day responsibilities rather than business metrics, architectural trade-offs, and strategic decision-making required for ${targetRole}.`,
                perceivedSeniority: "Mid-to-Senior Professional",
                strengthsSeenByRecruiter: [
                    "Solid technical grounding and consistent delivery across milestones",
                    "Strong familiarity with core tools and day-to-day operational execution",
                    "Cross-functional collaboration with stakeholders and team members",
                ],
                potentialHesitations: [
                    `May be categorized too narrowly as a ${currentRole} rather than a strategic leader`,
                    "Missing explicit metrics on business ROI, latency gains, or user growth",
                ],
            },
            strategicReframingAngle: `Pivot your narrative from 'what tasks I performed' to 'what business problem I solved, what tradeoffs I evaluated, and what quantifiable outcome resulted.' This immediately elevates your standing in hiring manager reviews.`,
            sections: [
                {
                    sectionId: "headline",
                    sectionTitle: "Profile Headline & Title",
                    originalContent: `${currentRole} | Tech Professional`,
                    tailoredContent: `${targetRole} | Product & Engineering Systems | Scalable Impact`,
                    recruiterRationale: "Positioning yourself with the target title and domain breadth catches recruiter attention in under 5 seconds.",
                    suggestions: ["Keep it under 100 characters", "Highlight your core leverage area"],
                },
                {
                    sectionId: "summary",
                    sectionTitle: "Professional Summary & Narrative",
                    originalContent: `Hardworking ${currentRole} with experience building solutions and delivering client-facing applications in high-paced environments.`,
                    tailoredContent: `Results-driven ${targetRole} with a proven track record of bridging customer insights, technical architecture, and cross-functional execution. Experienced in driving end-to-end product roadmaps, decreasing cycle time, and delivering measurable revenue and user engagement gains.`,
                    recruiterRationale: "Frames your career trajectory as an intentional, strategic evolution toward high-leverage ownership.",
                    suggestions: ["Open with your strongest differentiator", "Include 1-2 quantified career highlights"],
                },
                {
                    sectionId: "experience",
                    sectionTitle: "Work Experience & Achievement Bullets",
                    originalContent: `• Responsible for developing features and maintaining codebase stability.\n• Collaborated with team members on sprints and product releases.\n• Fixed bugs and improved system performance.`,
                    tailoredContent: `• Spearheaded end-to-end lifecycle of flagship initiatives, boosting adoption by 34% across 50K+ active users.\n• Architected scalable workflows that reduced deployment latency by 42% and mitigated critical operational bottlenecks.\n• Partnered with executive stakeholders and engineering leads to prioritize roadmap deliverables based on user retention data.`,
                    recruiterRationale: "Uses Google's X-Y-Z formula (Accomplished [X] measured by [Y] by doing [Z]) which recruiters score highest.",
                    suggestions: ["Always lead with an active verb", "Ensure every bullet contains a number or clear outcome"],
                },
                {
                    sectionId: "skills",
                    sectionTitle: "Core Competencies & Keywords",
                    originalContent: "JavaScript, React, Node.js, Git, Agile, Communication",
                    tailoredContent: "Strategic Roadmap Planning, Systems Architecture, A/B Experimentation, Distributed Systems, Cross-Functional Leadership, High-Throughput APIs, Metrics & KPI Instrumentation",
                    recruiterRationale: "Front-loads the exact high-value keywords that enterprise ATS parsers and senior recruiters scan for.",
                    suggestions: ["Group skills into Categories (e.g. Architecture, Strategy, Tools)"],
                },
                {
                    sectionId: "projects",
                    sectionTitle: "Key Projects & Case Studies",
                    originalContent: "Built a web app to help teams collaborate and track tasks in real-time.",
                    tailoredContent: "Real-Time Collaboration Platform: Designed distributed sync engine supporting multi-tenant state replication with <150ms p99 latency; reduced user churn by 18%.",
                    recruiterRationale: "Anchors your technical credibility with tangible problem-discovery and solution-tradeoff framing.",
                    suggestions: ["Highlight the 'Why' behind technical decisions"],
                },
            ],
        };

        const result = await callJSON<CareerNarrativeResult>({
            system: NARRATIVE_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 3500,
            timeoutMs: 35000,
            mock: fallbackData,
        });

        return NextResponse.json({
            success: true,
            narrative: result,
        });
    } catch (err) {
        console.error("[api/resume/narrative] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to generate career narrative" },
            { status: 500 }
        );
    }
}
