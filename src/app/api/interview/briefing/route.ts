import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

export interface DecodedResponsibility {
    responsibility: string;
    whatTheyAreReallyTesting: string;
    recommendedApproach: string;
}

export interface PreInterviewBriefing {
    role: string;
    companyName: string;
    summary: string;
    decodedResponsibilities: DecodedResponsibility[];
    strategicApproachTips: string[];
    commonPitfallsToAvoid: string[];
    killerQuestionsToAskInterviewer: string[];
}

const BRIEFING_SYSTEM_PROMPT = `You are a Principal Executive Recruiter and Interview Coach at elite tech companies.
Your job is to generate a comprehensive "Pre-Interview Strategy Briefing" for a candidate about to walk into a live mock or real interview.

Analyze the given role, seniority level, target company (if any), and job responsibilities.
Provide clear, tactical guidance that arms the candidate with an immediate unfair advantage before the interview starts.

Address the candidate directly ("You should...", "Demonstrate how you...").

Return a JSON object with this exact structure:
{
  "role": "<Role Name>",
  "companyName": "<Company Name or 'Industry Benchmark'>",
  "summary": "<2-3 sentence strategic briefing summarizing the core evaluation bar and mindset needed for this interview>",
  "decodedResponsibilities": [
    {
      "responsibility": "<Core responsibility from job description or standard role profile>",
      "whatTheyAreReallyTesting": "<The underlying competency interviewers are evaluating>",
      "recommendedApproach": "<Tactical advice on how you should frame your examples and answers to demonstrate mastery>"
    }
  ],
  "strategicApproachTips": [
    "<High-leverage tip 1 (e.g. framing structure, communication rhythm)>",
    "<High-leverage tip 2 (e.g. trade-off analysis, technical depth)>",
    "<High-leverage tip 3 (e.g. aligning metrics to business outcomes)>"
  ],
  "commonPitfallsToAvoid": [
    "<Specific mistake candidates frequently make in this interview format>",
    "<Another specific mistake to avoid>"
  ],
  "killerQuestionsToAskInterviewer": [
    "<Thought-provoking question showing deep domain maturity>",
    "<Strategic question about company/system architecture or prioritization>"
  ]
}`;

// Helper: fallback pre-interview gameplans if offline or in mock
function getHeuristicBriefing(role: string, company: string, seniority: string): PreInterviewBriefing {
    const comp = company || "Top Tech Standards";
    return {
        role,
        companyName: comp,
        summary: `Entering an interview for ${role} at ${comp} requires balancing deep hands-on execution with strategic business context. Interviewers will test your ability to navigate trade-offs under ambiguity and communicate with crisp executive clarity.`,
        decodedResponsibilities: [
            {
                responsibility: "Driving technical decisions & system architecture",
                whatTheyAreReallyTesting: "Can you evaluate trade-offs (scalability vs latency vs developer velocity) rather than just picking a trendy technology?",
                recommendedApproach: "Explicitly state your constraints first (budget, throughput, fault tolerance) and walk through why you discarded alternatives.",
            },
            {
                responsibility: "Cross-functional collaboration with stakeholders",
                whatTheyAreReallyTesting: "How do you handle disagreement, scope pushback, and alignment with non-technical partners?",
                recommendedApproach: "Use the STAR framework. Highlight how you listened to opposing perspectives, aligned on shared metrics, and unblocked progress.",
            },
            {
                responsibility: "Delivering measurable business outcomes",
                whatTheyAreReallyTesting: "Do you understand the business impact of your work or do you view engineering in a vacuum?",
                recommendedApproach: "Anchor your stories with hard numbers: 'Reduced latency by 35%', 'Decreased AWS cloud spend by $120k/yr', or 'Sped up sprint velocity by 2x'.",
            },
        ],
        strategicApproachTips: [
            "Clarify before jumping in: Spend the first 60 seconds confirming assumptions, constraints, and success criteria.",
            "Think aloud continuously: Interviewers evaluate your problem-solving journey just as much as the final answer.",
            "Quantify your impact: Whenever discussing past projects, mention the scale (QPS, users, revenue) to establish seniority.",
            "Acknowledge trade-offs: Never present a silver bullet; good candidates know every architecture choice has drawbacks.",
        ],
        commonPitfallsToAvoid: [
            "Over-indexing on theory without grounding answers in real-world messy constraints.",
            "Rambling without a clear structured framework (e.g., jumping straight to code before architecture).",
            "Failing to check in with the interviewer: Pause periodically and ask 'Would you like me to dive deeper into this component?'",
        ],
        killerQuestionsToAskInterviewer: [
            `What is the single biggest architectural or product hurdle the team at ${comp} is facing in the next two quarters?`,
            "How does the engineering and product team balance paying down tech debt versus shipping new roadmap initiatives?",
        ],
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            role = "Software Engineer",
            seniority = "Mid-Level",
            companyName = "Industry Standard",
            responsibilities = [],
        } = body;

        const fallback = getHeuristicBriefing(role, companyName, seniority);

        const respText = Array.isArray(responsibilities) && responsibilities.length > 0
            ? responsibilities.join("\n• ")
            : typeof responsibilities === "string" && responsibilities.trim()
                ? responsibilities.trim()
                : "Standard industry responsibilities for this role.";

        const prompt = `ROLE: ${role}
SENIORITY LEVEL: ${seniority}
TARGET COMPANY: ${companyName}

ROLE RESPONSIBILITIES & EXPECTATIONS:
• ${respText}

Generate a concise, high-impact Pre-Interview Strategy Briefing tailored specifically to this role and company.`;

        const result = await callJSON<PreInterviewBriefing>({
            system: BRIEFING_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 2500,
            timeoutMs: 25000,
            mock: fallback,
        });

        return NextResponse.json({
            success: true,
            briefing: result,
        });
    } catch (err) {
        console.error("[api/interview/briefing] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to generate briefing" },
            { status: 500 }
        );
    }
}
