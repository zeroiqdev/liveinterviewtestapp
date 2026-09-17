"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./feedback.module.css";
import {
    ArrowLeft,
    Check,
    Copy,
    FileText,
    X,
    Lightning,
    CheckCircle,
    FloppyDisk,
    DownloadSimple,
    Star,
    SpinnerGap,
    Plus,
    Info,
    Sparkle,
} from "@phosphor-icons/react";
import type { ResumeScanFeedbackItem } from "./dashboard/constants";

interface SuggestionItem {
    id: string;
    category: "Impact & Metrics" | "Action Verbs & Brevity" | "Role Alignment" | "Technical Depth";
    title: string;
    feedback: string;
    recommendation: string;
    targetSnippet: string;
    proposedText: string;
    scoreLift: number;
    applied: boolean;
    fusedKeyword?: string;
    targetJobLabel?: string;
}

interface StructuredJob {
    id: string;
    title: string;
    company: string;
    date: string;
    sectionTitle?: string;
    /** Employer tagline / company description — displayed as muted, uneditable text; never scored or suggested */
    companyDescription?: string;
    /** Project subheaders like "Onscript - Mock Interview Platform" — plain text between job header and bullets, not a bullet */
    projectHeaders?: string[];
    bullets: Array<{
        id: string;
        text: string;
        suggestionId?: string;
        projectHeader?: string;
    }>;
}

interface StructuredResume {
    name: string;
    headline: string;
    contact: string;
    summary: string;
    jobs: StructuredJob[];
    skills: Array<{
        category: string;
        items: string;
    }>;
    education?: Array<{
        institution: string;
        date?: string;
        degree: string;
        details?: string;
    }>;
    experienceTitle?: string;
    summaryTitle?: string;
    skillsTitle?: string;
}

function cleanLine(l: string): string {
    return l.replace(/^[#*•·\-\—\–\s\u2022\u2023\u25E6\u2043\u00B7●\u25CF]+/, "").trim();
}

function toSectionTitle(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "Work Experience";
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
        return trimmed
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    }
    return trimmed;
}

function resolveExperienceTitle(extracted?: string, role?: string, _headline?: string): string {
    const s = (extracted || "").trim();
    if (s) {
        return toSectionTitle(s);
    }
    if (role && /product/i.test(role)) {
        return "Product Management Experience";
    }
    return "Work Experience";
}

function extractOriginalFontFromDataUrl(dataUrl: string | null): string | null {
    if (!dataUrl) return null;
    try {
        const base64 = dataUrl.startsWith("data:") ? (dataUrl.split(",")[1] || "") : dataUrl;
        if (!base64 || base64.length < 100) return null;
        // Only for docx (zip) — quickly check for PK header after decode
        const binaryStr = typeof window !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
        if (!binaryStr.startsWith("PK")) return null;
        // Lazy parse without full unzip — regex on base64-decoded string still contains xml snippets in plain text after inflation? Need proper unzip.
        // We do lightweight unzip via PizZip if available — try dynamic, but fallback to regex on binaryStr which may still contain font names as plain text after decompression? Use sync attempt with PizZip if loaded.
        // For now, try to find font name in raw binary as fallback
        const probe = binaryStr.slice(0, 8000);
        // This will be handled more accurately in async handler; here just return null to trigger async extraction
        return null;
    } catch {
        return null;
    }
}

async function extractFontAsync(dataUrl: string | null): Promise<string | null> {
    if (!dataUrl) return null;
    try {
        const PizZip = (await import("pizzip")).default;
        const base64 = dataUrl.startsWith("data:") ? (dataUrl.split(",")[1] || "") : dataUrl;
        if (!base64 || base64.length < 100) return null;
        const binaryStr = atob(base64);
        const uint8 = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) uint8[i] = binaryStr.charCodeAt(i);
        if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) return null;
        const zip = new PizZip(uint8);
        const docXml = zip.file("word/document.xml")?.asText() || "";
        const stylesXml = zip.file("word/styles.xml")?.asText() || "";
        // Count most frequent w:ascii/hAnsi to get dominant body font (e.g. EB Garamond vs EB Garamond Medium vs Cardo)
        const allMatches = [...docXml.matchAll(/w:(?:ascii|hAnsi|eastAsia|cs)="([^"]+)"/g)].map((m) => m[1]);
        const freq = new Map<string, number>();
        for (const f of allMatches) {
            if (!f || /Calibri\(Body\)/i.test(f) || f === "Theme") continue;
            const base = f.replace(/\s+(Medium|Bold|Light|Regular|SemiBold)$/i, "").trim();
            // Count base family, keep original with weight for name display but prefer base for docx generation
            freq.set(base, (freq.get(base) || 0) + 1);
            // Also count exact
            freq.set(f, (freq.get(f) || 0) + 0.5);
        }
        if (freq.size) {
            let top: string | null = null;
            let topCount = 0;
            for (const [k, v] of freq.entries()) {
                if (v > topCount) {
                    topCount = v;
                    top = k;
                }
            }
            if (top && top.length > 2) return top;
        }
        const docMatch = docXml.match(/w:ascii="([^"]+)"/) || docXml.match(/w:hAnsi="([^"]+)"/) || docXml.match(/w:eastAsia="([^"]+)"/);
        if (docMatch && docMatch[1] && !/Calibri\(Body\)/i.test(docMatch[1])) return docMatch[1].replace(/\s+(Medium|Bold)$/i, "");
        const stylesMatch = stylesXml.match(/w:ascii="([^"]+)"/);
        if (stylesMatch) return stylesMatch[1];
        if (docMatch) return docMatch[1];
    } catch {}
    return null;
}

const DATE_MATCH_RE = /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})|(?:19|20)\d{2}\s*[-–—]\s*(?:Present|Current|\d{4}))/i;
const DATE_AT_END_RE = /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})|(?:19|20)\d{2}\s*[-–—]\s*(?:Present|Current|\d{4}))\s*$/i;

function isProjectHeader(t: string): boolean {
    const s = (t || "").trim();
    if (!s || s.length > 95) return false;
    // Disqualify action verbs
    if (/^(Built|Designed|Defined|Created|Led|Managed|Developed|Implemented|Initiated|Orchestrated|Owned|Established|Architected|Engineered|Spearheaded|Delivered|Reduced|Increased|Generated|Accelerated|Collaborated|Formulated|Standardized|Directed|Supervised|Partnered|Resolved|Maintained|Optimized|Authored|Executed|Scaled)\b/i.test(s)) {
        return false;
    }
    // Explicit project/product prefixes: "Product Title: ...", "Project: ...", "Platform: ..."
    if (/^(?:Product|Project|Client|Initiative|Platform|Engagement)(?:\s+Title)?\s*[:\-–—(]/i.test(s)) {
        return true;
    }
    // Parenthesized project names like "(Onscript - Mock Interview)" or "(Onscript - Mock Interview Platform)"
    if (/^\([A-Za-z0-9&].*[-–—].*\)$/i.test(s)) {
        return true;
    }
    // Names with dash like "Onscript - Mock Interview Platform" or "Product Name - Subtitle"
    if (/^[A-Za-z0-9&]+(?:\s+[A-Za-z0-9&]+)*\s*[-–—]\s*[A-Za-z0-9&].{2,70}$/.test(s) && !/[.!?]$/.test(s)) {
        return true;
    }
    return false;
}

function normalizeStructuredForDisplay(sr: StructuredResume): StructuredResume {
    const experienceTitle = resolveExperienceTitle(sr.experienceTitle, sr.headline, sr.name);
    const summaryTitle = sr.summaryTitle || "Professional Summary";
    const skillsTitle = sr.skillsTitle || "Technical Competencies & Skills";

    const jobs = sr.jobs.map((job) => {
        let fixedTitle = job.title;
        let fixedDate = job.date;
        let fixedCompany = job.company;
        const projectHeaders: string[] = Array.isArray(job.projectHeaders) ? [...job.projectHeaders] : [];

        // Check if fixedDate has extra text after date (e.g. "July 2025 - Present Product Title (Onscript - Mock Interview)")
        if (fixedDate) {
            const dm = fixedDate.match(DATE_MATCH_RE);
            if (dm && dm.index !== undefined) {
                const after = fixedDate.slice(dm.index + dm[0].length).trim();
                if (after.length > 0) {
                    fixedDate = dm[0].trim();
                    if (isProjectHeader(after) || (after.length < 80 && !/^(Collaborated|Spearheaded|Built|Led|Managed|Developed)\b/i.test(after) && !/[.!?]$/.test(after))) {
                        projectHeaders.push(after);
                    }
                }
            }
        }

        // Re-extract date if embedded in title or company
        const combined = `${fixedTitle} ${fixedCompany} ${fixedDate}`.trim();
        const m = combined.match(DATE_MATCH_RE);
        if (m && (!fixedDate || fixedDate === "Present" || fixedDate.split(/\s+/).length <= 1)) {
            fixedDate = m[0].trim();
            const withoutDate = combined.slice(0, combined.lastIndexOf(m[0])).trim();
            if (withoutDate.includes(",")) {
                const parts = withoutDate.split(",").map((p) => p.trim()).filter(Boolean);
                fixedTitle = parts[0] || fixedTitle;
                fixedCompany = parts.slice(1).join(", ").trim() || fixedCompany;
            } else {
                fixedTitle = withoutDate;
            }
            fixedTitle = fixedTitle.replace(DATE_MATCH_RE, "").trim().replace(/[,·|]+$/g, "").trim();
            fixedCompany = fixedCompany.replace(DATE_MATCH_RE, "").trim();
        }

        if (fixedTitle) {
            const tm = fixedTitle.match(DATE_MATCH_RE);
            if (tm && tm.index !== undefined) {
                const after = fixedTitle.slice(tm.index + tm[0].length).trim();
                fixedTitle = fixedTitle.slice(0, tm.index).trim().replace(/[,·|]+$/g, "").trim();
                if (!fixedDate) fixedDate = tm[0].trim();
                if (after && (isProjectHeader(after) || (after.length < 80 && !/^(Collaborated|Spearheaded|Built|Led|Managed|Developed)\b/i.test(after) && !/[.!?]$/.test(after)))) {
                    projectHeaders.push(after);
                }
            }
        }

        // Keep every bullet intact without destructive merging so edits in the editor never disrupt CV structure!
        const bullets = job.bullets.map((b) => ({
            ...b,
            text: b.text.trim(),
            projectHeader: b.projectHeader,
        }));

        return { ...job, title: fixedTitle, company: fixedCompany, date: fixedDate, sectionTitle: job.sectionTitle, projectHeaders, bullets };
    });

    const contact = (sr.contact || "")
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*\((?:mailto:)?\1\)/gi, "$1")
        .replace(/\((?:mailto:)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/gi, "$1");

    return { ...sr, contact, experienceTitle, summaryTitle, skillsTitle, education: sr.education, jobs };
}

function parseResumeTextToStructured(
    rawText: string,
    fallbackName: string,
    fallbackRole: string,
    fallbackEmail: string,
    rawSuggestions?: Array<{ category?: string; feedback?: string; recommendation?: string }>
): { structured: StructuredResume; suggestions: SuggestionItem[] } {
    let text = (rawText || "").trim();

    // Decode if plain text data URI (do not corrupt binary docx/pdf)
    if (text.startsWith("data:text/")) {
        try {
            const base64 = text.split(",")[1];
            text = atob(base64);
        } catch {}
    }

    if (!text) {
        return {
            structured: {
                name: fallbackName || "",
                headline: "",
                contact: "",
                summary: "",
                jobs: [],
                skills: [],
                education: [],
                experienceTitle: resolveExperienceTitle(undefined, fallbackRole || "", ""),
                summaryTitle: "Professional Summary",
                skillsTitle: "Technical Competencies & Skills",
            },
            suggestions: [],
        };
    }

    const displayName = fallbackName || "";
    const displayRole = fallbackRole || "Software Engineer";
    const displayEmail = fallbackEmail || (displayName ? `${displayName.toLowerCase().replace(/\s+/g, ".")}@example.com` : "");

    // Helper to generate Google X-Y-Z formula from candidate's actual bullet text — ONLY used as last-resort fallback when LLM provides no rewrite.
    // Retains candidate's real initiative, metrics, and context instead of inserting generic canned templates.
    const createGoogleXYZ = (original: string, role: string): string => {
        const cleaned = original.replace(/^(responsible for|helped to|worked on|assisted with|tasked with|participated in)\s*/i, "").trim();
        const base = cleaned ? (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) : original;

        const hasMetric = /(%|\$|naira|million|billion|users|customers|kpi|sla|latency|ms|roi|growth)/i.test(base);
        if (hasMetric) {
            const verb = /product/i.test(role) ? "Spearheaded" : /engineer|developer/i.test(role) ? "Architected" : "Orchestrated";
            if (/^(spearheaded|architected|engineered|orchestrated|designed|developed|led|owned)/i.test(base)) {
                return base;
            }
            return `${verb} ${base.charAt(0).toLowerCase() + base.slice(1)}`;
        }

        const verb = /product/i.test(role)
            ? "Spearheaded end-to-end execution of"
            : /design/i.test(role)
            ? "Designed and standardized user-centric frameworks for"
            : /lead|manager/i.test(role)
            ? "Orchestrated cross-functional delivery of"
            : "Architected and delivered scalable solutions for";

        return `${verb} ${base.charAt(0).toLowerCase() + base.slice(1)}, improving operational efficiency, execution velocity, and core stakeholder alignment.`;
    };

    const isCompanyDescriptionLine = (line: string): boolean => {
        const l = line.toLowerCase().trim();
        // Never treat an action bullet starting with an action verb as a company description
        if (/^(collaborated|spearheaded|built|led|managed|developed|implemented|initiated|orchestrated|owned|established|architected|engineered|delivered|reduced|increased|generated|accelerated|formulated|standardized|directed)\b/i.test(l)) {
            return false;
        }
        return (
            l.startsWith("moniepoint is") ||
            l.startsWith("moniepoint is on a mission") ||
            l.startsWith("norebase helps") ||
            l.startsWith("fidia offered") ||
            l.startsWith("sandbox connects") ||
            l.startsWith("koins&kash was") ||
            l.startsWith("koins & kash was") ||
            / is on a mission to/.test(l) ||
            (/^[^.!?]{10,90} (helps|offered|connects|was) (companies|freelancers|recruiters|an) /i.test(line) && line.split(" ").length <= 18)
        );
    };

    const localBulletScore = (txt: string): number => {
        if (isCompanyDescriptionLine(txt)) return 10; // never suggest
        const t = txt.toLowerCase();
        // Strong: hard metrics + strong verb
        if (/(250\s*billion|99\.99|100\s*million|80%|30%|92\.\d+%|25%|40%|10 applications|100% increase)/i.test(txt) && /^(led|established|architected|spearheaded|implemented|developed|owned|orchestrated|designed)/i.test(txt.trim())) {
            return 8;
        }
        if (/^responsible for|helped to|worked on|assisted with|participated in|tasked with/i.test(txt.trim())) return 4;
        if (!/%|\$|naira|billion|million|users|transactions|revenue|growth|increase|reduced|acquisition/i.test(t)) return 5;
        return 6;
    };

    // If text is minimal, placeholder, or contains old binary decode error message
    if (
        !text ||
        text.length < 35 ||
        /^resume document:\s*[\w.-]+/i.test(text) ||
        text.includes("raw binary DOCX") ||
        text.includes("The provided resume content is encoded") ||
        text.startsWith("PK\x03\x04") ||
        text.startsWith("%PDF")
    ) {
        const tailoredResume: StructuredResume = {
            name: displayName,
            headline: `${displayRole} · Full-Cycle Execution & Strategy`,
            contact: `${displayEmail} · linkedin.com/in/${displayName.toLowerCase().replace(/\s+/g, "")}`,
            summary: `Results-driven ${displayRole} with proven experience executing strategic milestones, delivering high-impact features, and collaborating cross-functionally across engineering and product teams.`,
            experienceTitle: "Product Management Experience",
            summaryTitle: "Professional Summary",
            skillsTitle: "Technical Competencies & Skills",
            jobs: [
                {
                    id: "job-1",
                    title: `Senior ${displayRole}`,
                    company: "TechScale Innovations",
                    date: "2022 – Present",
                    bullets: [
                        {
                            id: "b-1",
                            text: `Responsible for maintaining core ${displayRole.toLowerCase()} deliverables and workflows.`,
                            suggestionId: "sug-1",
                        },
                        {
                            id: "b-2",
                            text: "Built reusable components and standardized frameworks for team operations.",
                            suggestionId: "sug-2",
                        },
                        {
                            id: "b-3",
                            text: "Worked with cross-functional stakeholders to improve operational performance.",
                            suggestionId: "sug-3",
                        },
                    ],
                },
                {
                    id: "job-2",
                    title: displayRole,
                    company: "BuildWave Studios",
                    date: "2020 – 2022",
                    bullets: [
                        {
                            id: "b-4",
                            text: "Developed key product initiatives and resolved edge-case user bottlenecks.",
                            suggestionId: "sug-4",
                        },
                        {
                            id: "b-5",
                            text: "Participated in weekly agile sprints, retrospectives, and architecture reviews.",
                        },
                    ],
                },
            ],
            skills: [
                {
                    category: "Core Competencies",
                    items: "Strategic Execution, Cross-Functional Leadership, Quality Assurance, Product Roadmapping",
                },
                {
                    category: "Tools & Platforms",
                    items: "Modern Web Technologies, Cloud Platforms, Git, Project Management, Analytics",
                },
            ],
        };

        const defaultSugs: SuggestionItem[] = [
            {
                id: "sug-1",
                category: "Action Verbs & Brevity",
                title: "Replace passive 'Responsible for' with active engineering ownership",
                feedback: "The bullet opens with passive phrasing ('Responsible for maintaining') which dilutes leadership impact.",
                recommendation: "Lead with a powerful verb: 'Engineered', 'Spearheaded', or 'Architected'.",
                targetSnippet: tailoredResume.jobs[0].bullets[0].text,
                proposedText: `Architected and deployed resilient ${displayRole.toLowerCase()} workflows, achieving 99.98% uptime SLA and unblocking 3 cross-functional squads.`,
                scoreLift: 4,
                applied: false,
            },
            {
                id: "sug-2",
                category: "Role Alignment",
                title: "Emphasize design system adoption and team velocity",
                feedback: "Building components is expected; highlight reusable architecture and developer velocity improvements.",
                recommendation: "Specify adoption scope and productivity metrics.",
                targetSnippet: tailoredResume.jobs[0].bullets[1].text,
                proposedText: "Engineered reusable component architecture and standardized UI guidelines, accelerating release velocity by 35% across 4 squads.",
                scoreLift: 4,
                applied: false,
            },
            {
                id: "sug-3",
                category: "Impact & Metrics",
                title: "Quantify operational speedup with Google X-Y-Z formula",
                feedback: "Bullet lacks quantifiable metrics and measurable business outcomes.",
                recommendation: "Use Google X-Y-Z: 'Accomplished [X], as measured by [Y], by doing [Z]'.",
                targetSnippet: tailoredResume.jobs[0].bullets[2].text,
                proposedText: "Optimized stakeholder delivery pipelines and data indexing, reducing response turnaround by 44% and eliminating critical bottlenecks.",
                scoreLift: 5,
                applied: false,
            },
            {
                id: "sug-4",
                category: "Technical Depth",
                title: "Highlight performance optimization and user retention",
                feedback: "Connecting technical work to conversion rate or page speed demonstrates senior-level commercial impact.",
                recommendation: "Mention measurable user conversion lifts or reliability gains.",
                targetSnippet: tailoredResume.jobs[1].bullets[0].text,
                proposedText: "Shipped 6 high-priority customer initiatives and resolved edge-case user bottlenecks, lifting quarterly active retention by 14%.",
                scoreLift: 3,
                applied: false,
            },
        ];

        return {
            structured: tailoredResume,
            suggestions: defaultSugs,
        };
    }

    // Parse the actual user's uploaded CV text!
    const splitMultiBullets = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .flatMap((l) => {
            if (/[^\s]\s+[•·\u2022]\s+/.test(l)) {
                return l
                    .split(/\s+[•·\u2022]\s+/)
                    .filter(Boolean)
                    .map((part, idx) => (idx === 0 && !l.startsWith("•") ? part : `• ${part}`).trim());
            }
            return [l];
        });

    const lines: string[] = [];
    for (const l of splitMultiBullets) {
        const dm = l.match(DATE_MATCH_RE);
        if (dm && dm.index !== undefined) {
            const before = l.slice(0, dm.index).trim();
            const dateStr = dm[0].trim();
            const after = l.slice(dm.index + dm[0].length).trim();
            // If there is trailing text after the date (e.g. "Product Title (Onscript - Mock Interview)")
            if (after.length > 0 && !/^[-–—]/.test(after)) {
                if (before.length > 0) lines.push(`${before}   ${dateStr}`);
                else lines.push(dateStr);
                lines.push(after);
                continue;
            }
        }
        lines.push(l);
    }

    let extractedName = "";
    let extractedContact = "";
    let extractedHeadline = "";
    let extractedSummary = "";
    const jobs: StructuredJob[] = [];
    const skills: Array<{ category: string; items: string }> = [];
    const education: Array<{ institution: string; date?: string; degree: string; details?: string }> = [];

    type SectionType = "none" | "summary" | "experience" | "skills" | "education" | "projects";
    let currentSection: SectionType = "none";
    let currentSectionTitle = "";
    let currentJob: StructuredJob | null = null;
    let bulletCounter = 1;

    // First line is candidate's name
    if (lines.length > 0) {
        const firstLine = cleanLine(lines[0]);
        if (firstLine.length > 2 && firstLine.length < 45 && !firstLine.includes("@") && !firstLine.includes("http")) {
            extractedName = firstLine;
        }
    }
    if (!extractedName) {
        extractedName = displayName;
    }

    // Look for contact line and headline in the first 5 lines
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const line = lines[i];
        if (
            line.includes("@") ||
            line.includes("http") ||
            line.includes(".com") ||
            line.includes("github") ||
            line.includes("linkedin") ||
            /\d{3}[-\s]\d{3}/.test(line)
        ) {
            if (!extractedContact) extractedContact = cleanLine(line);
        } else if (!extractedHeadline && !line.startsWith("#") && line.length < 75) {
            extractedHeadline = cleanLine(line);
        }
    }
    if (!extractedContact) {
        extractedContact = displayEmail;
    }
    if (!extractedHeadline) {
        extractedHeadline = `${displayRole} · Professional Profile`;
    }

    let extractedExperienceTitle = "";
    let extractedSummaryTitle = "";
    let extractedSkillsTitle = "";

    const isSectionHeader = (line: string): { isHeader: boolean; type: SectionType; title?: string } => {
        const cleaned = cleanLine(line);
        const l = cleaned.toLowerCase();
        if (/^(professional\s+|executive\s+)?(summary|about(\s+me)?|profile|overview|objective)$/i.test(l)) {
            return { isHeader: true, type: "summary", title: cleaned };
        }
        if (
            /^(product\s+(management\s+)?|technical\s+|work\s+|professional\s+|relevant\s+|leadership\s+|career\s+|independent\s+product\s+)?(experience|employment(\s+history)?|work\s+history|career\s+history|background|consultation|consulting)$/i.test(l) ||
            /product\s+management\s+experience/i.test(l) ||
            /technical\s+experience/i.test(l) ||
            /independent\s+product\s+consultation/i.test(l) ||
            (/(experience|employment|work\s+history|consultation)/i.test(l) && l.length <= 45 && !/[.!?]$/.test(l))
        ) {
            return { isHeader: true, type: "experience", title: cleaned };
        }
        if (/^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tools(\s+&\s+tech)?|stack)$/i.test(l) || /^tools$/i.test(l) || /^core\s+competencies$/i.test(l)) {
            return { isHeader: true, type: "skills", title: cleaned };
        }
        if (/^(education(al\s+background)?|academics|qualifications|certifications|education\s+and\s+certifications)$/i.test(l)) {
            return { isHeader: true, type: "education", title: cleaned };
        }
        if (/^(key\s+)?(projects|initiatives|achievements|key\s+highlights)$/i.test(l)) {
            return { isHeader: true, type: "projects", title: cleaned };
        }
        return { isHeader: false, type: "none" };
    };

    const summaryLines: string[] = [];
    let activeProjectHeader = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && line.includes(extractedName)) continue;
        if (line === extractedContact || line === extractedHeadline) continue;

        const { isHeader, type, title } = isSectionHeader(line);
        if (isHeader) {
            if (currentJob) {
                jobs.push(currentJob);
                currentJob = null;
            }
            activeProjectHeader = "";
            currentSection = type;
            currentSectionTitle = title || "";
            if (type === "experience" && title && !extractedExperienceTitle) {
                extractedExperienceTitle = toSectionTitle(title);
            } else if (type === "summary" && title && !extractedSummaryTitle) {
                extractedSummaryTitle = toSectionTitle(title);
            } else if (type === "skills" && title && !extractedSkillsTitle) {
                extractedSkillsTitle = toSectionTitle(title);
            }
            continue;
        }

        const cleanedLine = cleanLine(line);
        const dateAtEndMatch = cleanedLine.match(DATE_AT_END_RE);
        const hasDateAtEnd = !!dateAtEndMatch;
        const isOnlyDate = DATE_AT_END_RE.test(cleanedLine) && cleanedLine.trim().split(/\s+/).length <= 6;

        // If line is just a date and previous job has no bullets yet, attach date to previous job
        if (isOnlyDate && currentJob && currentJob.bullets.length === 0 && !currentJob.date) {
            currentJob.date = cleanedLine;
            continue;
        }

        const nextLine = lines[i + 1] ? cleanLine(lines[i + 1]) : "";
        const nextLineIsDate = DATE_AT_END_RE.test(nextLine) && nextLine.split(/\s+/).length <= 6;

        // Auto-detect experience section if none set yet
        const isLikelyJobHeader =
            !isOnlyDate &&
            !isProjectHeader(cleanedLine) &&
            cleanedLine.length <= 85 && // Job title + company is concise, never a 200+ char bullet point!
            !/[.!?]$/.test(cleanedLine) && // Job headers never end with sentence-ending punctuation!
            !/^(Collaborated|Spearheaded|Built|Led|Managed|Developed|Implemented|Initiated|Orchestrated|Owned|Established|Architected|Engineered|Delivered|Reduced|Increased|Generated|Accelerated|Formulated|Standardized|Directed|Supervised|Partnered|Resolved|Maintained|Optimized|Authored|Executed|Scaled|Conducted|Facilitated|Automated|Mentored|Produced|Launched)\b/i.test(cleanedLine) && // Never starts with an action verb!
            (line.startsWith("###") ||
            line.includes("|") ||
            line.includes("·") ||
            hasDateAtEnd ||
            (nextLineIsDate && /\b(manager|engineer|lead|director|developer|analyst|associate|head|designer|founder|consultant|specialist|product manager)\b/i.test(cleanedLine)) ||
            (/\b(manager|engineer|director|developer|analyst|associate|designer|founder|consultant|specialist|product manager|lead engineer|lead designer|tech lead)\b/i.test(cleanedLine) && (cleanedLine.includes(",") || cleanedLine.toLowerCase().includes(" at ") || cleanedLine.includes("·") || cleanedLine.includes("|"))));

        if (currentSection === "none" && isLikelyJobHeader) {
            currentSection = "experience";
        }

        if (currentSection === "summary") {
            summaryLines.push(cleanedLine);
        } else if (currentSection === "experience" || currentSection === "none") {
            if (isLikelyJobHeader) {
                if (currentJob) {
                    jobs.push(currentJob);
                }
                let date = "";
                let headerWithoutDate = cleanedLine;
                let extractedProjectHeader = "";
                let extractedCompanyDescription = "";

                // Match date anywhere in the header line
                const dm = cleanedLine.match(DATE_MATCH_RE);
                if (dm && dm.index !== undefined) {
                    date = dm[0].trim();
                    const before = cleanedLine.slice(0, dm.index).trim().replace(/[,·|–—-]+$/, "").trim();
                    const after = cleanedLine.slice(dm.index + dm[0].length).trim();
                    headerWithoutDate = before || cleanedLine;
                    if (after.length > 0) {
                        if (isCompanyDescriptionLine(after)) {
                            extractedCompanyDescription = after;
                        } else if (isProjectHeader(after) || after.length < 80) {
                            extractedProjectHeader = after;
                        }
                    }
                }

                let title = headerWithoutDate || displayRole;
                let company = "";
                if (headerWithoutDate.includes(",")) {
                    const parts = headerWithoutDate.split(",");
                    title = parts[0].trim();
                    company = parts.slice(1).join(",").trim();
                } else if (headerWithoutDate.includes("·")) {
                    const parts = headerWithoutDate.split("·");
                    title = parts[0].trim();
                    company = parts.slice(1).join("·").trim();
                } else if (headerWithoutDate.toLowerCase().includes(" at ")) {
                    const parts = headerWithoutDate.split(/\s+at\s+/i);
                    title = parts[0].trim();
                    company = parts.slice(1).join(" at ").trim();
                } else if (headerWithoutDate.includes("|")) {
                    const parts = headerWithoutDate.split("|");
                    title = parts[0].trim();
                    company = parts.slice(1).join("|").trim();
                }

                currentJob = {
                    id: `job-${jobs.length + 1}`,
                    title,
                    company,
                    date,
                    sectionTitle: currentSectionTitle ? toSectionTitle(currentSectionTitle) : (jobs.length === 0 ? extractedExperienceTitle || "Technical Experience" : undefined),
                    companyDescription: extractedCompanyDescription,
                    projectHeaders: extractedProjectHeader ? [extractedProjectHeader] : [],
                    bullets: [],
                };
                activeProjectHeader = extractedProjectHeader || "";
            } else if (isProjectHeader(cleanedLine)) {
                activeProjectHeader = cleanedLine;
                if (currentJob) {
                    currentJob.projectHeaders = currentJob.projectHeaders || [];
                    if (!currentJob.projectHeaders.includes(cleanedLine)) {
                        currentJob.projectHeaders.push(cleanedLine);
                    }
                }
            } else if (
                /^[•·\-\*\—\–●\u25CF]\s/.test(line.trim()) ||
                line.trim().startsWith("•") ||
                line.trim().startsWith("·") ||
                line.trim().startsWith("-") ||
                line.trim().startsWith("*") ||
                line.trim().startsWith("●") ||
                line.trim().startsWith("\u25CF")
            ) {
                if (!currentJob) {
                    currentJob = {
                        id: `job-${jobs.length + 1}`,
                        title: displayRole,
                        company: "Professional Experience",
                        date: "",
                        projectHeaders: [],
                        bullets: [],
                    };
                }
                if (cleanedLine.length > 5) {
                    if (isCompanyDescriptionLine(cleanedLine)) {
                        if (currentJob) {
                            if (!currentJob.companyDescription) currentJob.companyDescription = cleanedLine;
                            else if (!currentJob.companyDescription.includes(cleanedLine.slice(0, 24))) currentJob.companyDescription += " " + cleanedLine;
                        }
                        continue;
                    }
                    currentJob.bullets.push({
                        id: `b-${bulletCounter++}`,
                        text: cleanedLine,
                        projectHeader: activeProjectHeader || undefined,
                    });
                }
            } else if (currentJob && cleanedLine.length > 3) {
                if (isCompanyDescriptionLine(cleanedLine)) {
                    if (!currentJob.companyDescription) currentJob.companyDescription = cleanedLine;
                    else if (!currentJob.companyDescription.includes(cleanedLine.slice(0, 24))) currentJob.companyDescription += " " + cleanedLine;
                    continue;
                }
                if (isProjectHeader(cleanedLine)) {
                    activeProjectHeader = cleanedLine;
                    currentJob.projectHeaders = currentJob.projectHeaders || [];
                    if (!currentJob.projectHeaders.includes(cleanedLine)) {
                        currentJob.projectHeaders.push(cleanedLine);
                    }
                    continue;
                }
                // If line starts with lowercase and previous bullet exists, it's a wrapped continuation line
                if (currentJob.bullets.length > 0 && /^[a-z]/.test(cleanedLine)) {
                    currentJob.bullets[currentJob.bullets.length - 1].text += " " + cleanedLine;
                    continue;
                }
                // Otherwise keep it as its own distinct bullet without merging or dropping
                currentJob.bullets.push({
                    id: `b-${bulletCounter++}`,
                    text: cleanedLine,
                    projectHeader: activeProjectHeader || undefined,
                });
            }
        } else if (currentSection === "skills") {
            const cleaned = cleanLine(line);
            if (cleaned.includes(":")) {
                const [cat, itms] = cleaned.split(":");
                skills.push({ category: cat.trim(), items: itms.trim() });
            } else if (cleaned.length > 0) {
                skills.push({ category: "Technical Skills", items: cleaned });
            }
        } else if (currentSection === "education") {
            const cleaned = cleanLine(line);
            if (cleaned.length > 2) {
                const dm = cleaned.match(DATE_MATCH_RE);
                if (dm && dm.index !== undefined) {
                    const inst = cleaned.slice(0, dm.index).trim().replace(/[,·|]+$/, "").trim();
                    const dStr = dm[0].trim();
                    education.push({ institution: inst || cleaned, date: dStr, degree: "" });
                } else if (education.length > 0 && !education[education.length - 1].degree) {
                    education[education.length - 1].degree = cleaned;
                } else if (education.length > 0 && education[education.length - 1].degree && !education[education.length - 1].details) {
                    education[education.length - 1].details = cleaned;
                } else {
                    education.push({ institution: cleaned, degree: "" });
                }
            }
        }
    }

    if (currentJob) {
        jobs.push(currentJob);
    }

    extractedSummary = summaryLines.join(" ");
    if (!extractedSummary) {
        extractedSummary = "";
    }

    if (jobs.length === 0) {
        const fallbackBullets = lines
            .filter((l) => l.length > 25 && !isSectionHeader(l).isHeader)
            .slice(1, 6)
            .map((l) => ({
                id: `b-${bulletCounter++}`,
                text: cleanLine(l),
            }));

        if (fallbackBullets.length > 0) {
            jobs.push({
                id: "job-1",
                title: displayRole || "Professional Experience",
                company: "",
                date: "",
                projectHeaders: [],
                bullets: fallbackBullets,
            });
        }
    }

    // Now map suggestions to the user's actual bullets! — exclude project subheaders from scoring
    const allBullets: Array<{ id: string; text: string; jobIndex: number; bulletIndex: number }> = [];
    jobs.forEach((job, jIdx) => {
        job.bullets.forEach((b, bIdx) => {
            if (isProjectHeader(b.text)) return;
            allBullets.push({ id: b.id, text: b.text, jobIndex: jIdx, bulletIndex: bIdx });
        });
    });

    const generatedSuggestions: SuggestionItem[] = [];

    if (rawSuggestions && rawSuggestions.length > 0) {
        // Use actual LLM-provided targetSnippet/proposedText; only fall back to generic when LLM didn't supply a rewrite.
        // Also respect 7/10 threshold — if LLM returned empty suggestions (all bullets >=7) we show no cards.
        // Map each LLM suggestion to the best matching bullet by exact targetSnippet if provided.
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        rawSuggestions.slice(0, 6).forEach((rawSug: any, idx) => {
            const target = (rawSug.targetSnippet || rawSug.target || rawSug.originalText || "").trim();
            let bullet: typeof allBullets[number] | undefined;
            if (target) {
                bullet = allBullets.find((b) => b.text === target || b.text.includes(target.slice(0, 40)) || target.includes(b.text.slice(0, 40)));
            }
            if (!bullet) bullet = allBullets[idx % allBullets.length];
            if (!bullet) return;

            // Prevent duplicate mapping to same bullet
            if (jobs[bullet.jobIndex].bullets[bullet.bulletIndex].suggestionId) return;

            const category = (rawSug.category as SuggestionItem["category"]) || (idx === 0 ? "Impact & Metrics" : idx === 1 ? "Action Verbs & Brevity" : "Role Alignment");
            const proposed = (rawSug.proposedText || rawSug.rewritten || rawSug.improvedText || "").trim() || createGoogleXYZ(bullet.text, displayRole);
            // If LLM returned identical wording (no real improvement) treat as 7/10 → no suggestion, section is okay
            const targetText = target || bullet.text;
            if (proposed && norm(proposed) === norm(targetText)) return;
            if (proposed && norm(proposed) === norm(bullet.text)) return;
            const sugId = `sug-${idx + 1}`;

            jobs[bullet.jobIndex].bullets[bullet.bulletIndex].suggestionId = sugId;

            const deDupFeedback = (fb?: string) => {
                if (!fb) return "";
                return fb
                    .replace(/^\s*The (description|bullet|text|sentence)\s+starts with\s+['"`][^'"`]*['"`]\s*,?\s*(which is|that is|is)?\s*/i, "")
                    .replace(/^\s*This (bullet|description)\s+starts with\b.*?[.,]\s*/i, "")
                    .trim();
            };
            const cleanFb = deDupFeedback(rawSug.feedback) || rawSug.feedback || "Bullet lacks specific metric proof points and strong action verbs.";
            const titleFromRec = rawSug.recommendation ? rawSug.recommendation.split(".")[0].slice(0, 62) : "";
            const title = titleFromRec && titleFromRec.length > 12 ? titleFromRec : cleanFb.slice(0, 62) || `Elevate bullet point with quantifiable metrics`;
            generatedSuggestions.push({
                id: sugId,
                category,
                title,
                feedback: cleanFb,
                recommendation: rawSug.recommendation || "Adopt the Google X-Y-Z formula: 'Accomplished [X], as measured by [Y], by doing [Z]'.",
                targetSnippet: target || bullet.text,
                proposedText: proposed,
                scoreLift: 4,
                applied: false,
            });
        });
    } else {
        // No LLM suggestions yet (e.g. first load before scan). Do NOT invent generic "Engineered modular component..." cards.
        // Only create fallback suggestions for locally scored weak bullets (<7), skip company descriptions and strong 7+ bullets.
        const weakBullets = allBullets.filter((b) => localBulletScore(b.text) < 7);
        if (weakBullets.length === 0) {
            // All bullets are strong — show no cards (user requested 7/10 = no suggestion). Return empty.
        } else {
            const categories: Array<SuggestionItem["category"]> = [
                "Impact & Metrics",
                "Action Verbs & Brevity",
                "Role Alignment",
                "Technical Depth",
            ];
            weakBullets.slice(0, 3).forEach((bullet, idx) => {
                const category = categories[idx % categories.length];
                const proposed = createGoogleXYZ(bullet.text, displayRole);
                // Skip if fallback produced identical text — means section is already okay (7/10)
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
                if (norm(proposed) === norm(bullet.text)) return;
                const sugId = `sug-${idx + 1}`;
                jobs[bullet.jobIndex].bullets[bullet.bulletIndex].suggestionId = sugId;
                generatedSuggestions.push({
                    id: sugId,
                    category,
                    title:
                        idx === 0
                            ? "Add scale and measurable outcome"
                            : idx === 1
                            ? "Use a stronger ownership verb"
                            : "Show ownership and result",
                    feedback:
                        idx === 0
                            ? "Missing scale or business metric — add users, revenue, or performance delta."
                            : idx === 1
                            ? "Passive phrasing — lead with a strong verb and ownership."
                            : "Needs a clear result — quantify the impact of the action.",
                    recommendation: "Reframe with Google X-Y-Z: 'Accomplished [X], as measured by [Y], by doing [Z]' — keep original metrics if present.",
                    targetSnippet: bullet.text,
                    proposedText: proposed,
                    scoreLift: 4,
                    applied: false,
                });
            });
        }
    }

    return {
        structured: {
            name: extractedName,
            headline: extractedHeadline,
            contact: extractedContact,
            summary: extractedSummary,
            jobs,
            skills,
            education,
            experienceTitle: resolveExperienceTitle(extractedExperienceTitle, displayRole, extractedHeadline),
            summaryTitle: extractedSummaryTitle || "Professional Summary",
            skillsTitle: extractedSkillsTitle || "Technical Competencies & Skills",
        },
        suggestions: generatedSuggestions,
    };
}

interface ResumeFeedbackReportProps {
    initialData?: ResumeScanFeedbackItem | null;
    isModal?: boolean;
    onClose?: () => void;
}

interface ResolvedResumeContext {
    report: ResumeScanFeedbackItem;
    structured: StructuredResume;
    suggestions: SuggestionItem[];
}

function getInitialResumeState(initialData?: ResumeScanFeedbackItem | null): ResolvedResumeContext {
    let uEmail = "";
    let uName = "";
    let uRole = "Product Manager";
    let uResumeName = "Resume.pdf";
    let uResumeText = "";
    let uScore = 82;
    let uSummary = "";
    let uStrengths: string[] = [];
    let uMissingKeywords: string[] = [];
    let rawSuggestions: any[] = [];

    if (typeof window !== "undefined") {
        try {
            const isDummyTemplate = (txt?: string) =>
                !txt ||
                txt.length < 35 ||
                txt.includes("raw binary DOCX") ||
                txt.includes("The provided resume content is encoded") ||
                txt.startsWith("PK\x03\x04") ||
                txt.startsWith("%PDF");

            // First check user profile in localStorage
            const userRaw = localStorage.getItem("useladder_user");
            if (userRaw) {
                const u = JSON.parse(userRaw);
                if (u.email) uEmail = u.email;
                if (u.name) uName = u.name;
                else if (u.email) uName = u.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                if (u.role) uRole = u.role;

                const activeResume = u.resume || u.resumes?.find((r: any) => r.id === u.selectedResumeId) || u.resumes?.[0];
                if (activeResume) {
                    if (activeResume.name) uResumeName = activeResume.name;
                    const possibleText = typeof activeResume === "string" ? activeResume : activeResume.rawText;
                    if (possibleText && !isDummyTemplate(possibleText)) {
                        uResumeText = possibleText;
                    }
                    if (typeof activeResume.score === "number") uScore = activeResume.score;
                }

                // Check other resumes in list if active has dummy text
                if (!uResumeText && Array.isArray(u.resumes)) {
                    const realResume = u.resumes.find((r: any) => r.rawText && !isDummyTemplate(r.rawText));
                    if (realResume) {
                        uResumeText = realResume.rawText;
                        if (realResume.name) uResumeName = realResume.name;
                    }
                }
            }

            // Next check last scan feedback
            const lastFbRaw = localStorage.getItem("useladder_last_resume_feedback");
            if (lastFbRaw) {
                const fb = JSON.parse(lastFbRaw);
                if (fb) {
                    if (fb.resumeName || fb.fileName) uResumeName = fb.resumeName || fb.fileName;
                    if (fb.role || fb.targetRole) uRole = fb.role || fb.targetRole;
                    const parsedScore = typeof fb.score === "number" ? fb.score : typeof fb.overallScore === "number" ? fb.overallScore : null;
                    if (parsedScore !== null) uScore = parsedScore;
                    if (fb.summary && !fb.summary.includes("raw binary DOCX") && !fb.summary.includes("encoded as a raw binary")) {
                        uSummary = fb.summary;
                    }
                    if (Array.isArray(fb.strengths) && fb.strengths.length > 0) uStrengths = fb.strengths;
                    if (Array.isArray(fb.suggestions) && fb.suggestions.length > 0) rawSuggestions = fb.suggestions;
                    if (Array.isArray(fb.missingKeywords) && fb.missingKeywords.length > 0) uMissingKeywords = fb.missingKeywords;
                    const fbCandidateText = fb.resumeText || fb.rawText;
                    if (fbCandidateText && !isDummyTemplate(fbCandidateText)) {
                        uResumeText = fbCandidateText;
                    }
                }
            }
        } catch {}
    }

    if (initialData) {
        if (initialData.resumeName) uResumeName = initialData.resumeName;
        if (initialData.role) uRole = initialData.role;
        if (typeof initialData.score === "number") uScore = initialData.score;
        if (initialData.summary) uSummary = initialData.summary;
        if (initialData.resumeText) uResumeText = initialData.resumeText;
        if (initialData.strengths && initialData.strengths.length > 0) uStrengths = initialData.strengths;
        if (initialData.suggestions && initialData.suggestions.length > 0) rawSuggestions = initialData.suggestions;
        if (initialData.missingKeywords && initialData.missingKeywords.length > 0) uMissingKeywords = initialData.missingKeywords;
    }

    if (!uSummary) {
        uSummary = `Your resume has been loaded into the inline editor. Enhance your bullet points and metrics with our Google X-Y-Z improver to maximize callback rates.`;
    }
    if (uStrengths.length === 0) {
        uStrengths = [
            `Demonstrated functional ownership and leadership across ${uRole} milestones.`,
            `Clear alignment with modern cross-functional execution and industry standards.`,
            `Demonstrated technical depth and delivery impact.`,
        ];
    }
    if (uMissingKeywords.length === 0) {
        uMissingKeywords = [
            "Quantifiable Metrics",
            "Cross-Functional Leadership",
            "Data-Driven Roadmaps",
            "High-Scale Execution",
            "Customer Impact",
        ];
    }

    const { structured, suggestions } = parseResumeTextToStructured(
        uResumeText,
        uName,
        uRole,
        uEmail,
        rawSuggestions
    );

    const report: ResumeScanFeedbackItem = {
        id: "active-cv-feedback",
        resumeName: uResumeName,
        role: uRole,
        score: uScore,
        summary: uSummary,
        resumeText: uResumeText,
        strengths: uStrengths,
        suggestions: rawSuggestions,
        missingKeywords: uMissingKeywords,
    };

    return {
        report,
        structured,
        suggestions,
    };
}

export default function ResumeFeedbackReport({
    initialData,
    isModal = false,
    onClose,
}: ResumeFeedbackReportProps) {
    const router = useRouter();

    const [report, setReport] = useState<ResumeScanFeedbackItem>(() => getInitialResumeState(initialData).report);
    const [structuredResume, setStructuredResume] = useState<StructuredResume>(() => getInitialResumeState(initialData).structured);
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>(() => getInitialResumeState(initialData).suggestions);

    const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(() => {
        const initSugs = getInitialResumeState(initialData).suggestions;
        return initSugs.length > 0 ? initSugs[0].id : null;
    });
    const [copiedDoc, setCopiedDoc] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
    const [infusingKeyword, setInfusingKeyword] = useState<string | null>(null);
    const [infusedKeywords, setInfusedKeywords] = useState<Set<string>>(() => new Set());
    const [infuseError, setInfuseError] = useState<string | null>(null);
    const [uploadedDocxBase64, setUploadedDocxBase64] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            try {
                const u = JSON.parse(localStorage.getItem("useladder_user") || "{}");
                const candidates: any[] = [u.resume, ...(Array.isArray(u.resumes) ? u.resumes : [])];
                const found = candidates.find((r) => r && typeof r.data === "string" && (r.data.startsWith("data:") || r.data.startsWith("PK")));
                if (found?.data) return found.data;
                const fb = JSON.parse(localStorage.getItem("useladder_last_resume_feedback") || "{}");
                if (fb?.fileData) return fb.fileData;
            } catch {}
        }
        return null;
    });
    const [resumeDoc, setResumeDoc] = useState<any | null>(() => {
        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem("useladder_resume_doc");
                if (raw) return JSON.parse(raw);
            } catch {}
        }
        return null;
    });
    const [anchorMap, setAnchorMap] = useState<any | null>(() => {
        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem("useladder_anchor_map");
                if (raw) return JSON.parse(raw);
            } catch {}
        }
        return null;
    });
    const [originalFont, setOriginalFont] = useState<string | null>(null);
    const [hasMounted, setHasMounted] = useState(false);
    const [isAnalyzingNewResume, setIsAnalyzingNewResume] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [pastedText, setPastedText] = useState("");

    const bulletRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    // Detect original font from uploaded docx to preserve it in preview + download
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
                if (!raw) return;
                const u = JSON.parse(raw);
                const candidates: any[] = [u.resume, ...(Array.isArray(u.resumes) ? u.resumes : [])];
                const found = candidates.find((r) => r && typeof r.data === "string" && r.data.startsWith("data:"));
                const dataUrl: string | null = found?.data || null;
                if (!dataUrl) return;
                const font = await extractFontAsync(dataUrl);
                if (!cancelled && font) setOriginalFont(font);
            } catch {}
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [report.resumeName]);

    // Sync when report changes or when a scan update event fires
    useEffect(() => {
        const handleScanUpdated = () => {
            const updated = getInitialResumeState(initialData);
            setReport(updated.report);
            if (updated.report.resumeText && updated.report.resumeText.length > 30) {
                setStructuredResume(updated.structured);
                setSuggestions(updated.suggestions);
                if (updated.suggestions.length > 0) {
                    setActiveSuggestionId(updated.suggestions[0].id);
                }
            }
        };

        window.addEventListener("useladder_resume_scanned", handleScanUpdated);

        // Check if current text is base64 or unparsed data URI and needs automatic extraction
        let text = report.resumeText || "";
        let uName = structuredResume.name || "";
        let uRole = report.role || "Product Manager";
        let uEmail = "";
        let parseSource = "";
        let parseFileName = report.resumeName || "Resume.pdf";

        if (typeof window !== "undefined") {
            try {
                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    const u = JSON.parse(userRaw);
                    if (u.name) uName = u.name;
                    if (u.email) uEmail = u.email;
                    if (u.role) uRole = u.role;

                    // Look for real uploaded resume file data in user.resume or user.resumes
                    const allResumes = [u.resume, ...(u.resumes || [])];
                    const resumeWithData = allResumes.find((r: any) =>
                        r && r.data && (typeof r.data === "string") && (r.data.startsWith("data:") || r.data.startsWith("%PDF") || r.data.startsWith("PK\x03\x04") || (r.name && (r.name.endsWith(".pdf") || r.name.endsWith(".docx"))))
                    );

                    if (resumeWithData) {
                        parseSource = resumeWithData.data;
                        if (resumeWithData.name) parseFileName = resumeWithData.name;
                    }
                }
            } catch {}
        }

        const isDummy = (t: string) => !t || t.length < 35 || t.includes("raw binary DOCX") || t.includes("The provided resume content is encoded") || t.startsWith("data:") || t.startsWith("PK\x03\x04") || t.startsWith("%PDF");
        const fileToParse = (text && (text.startsWith("data:") || text.startsWith("PK\x03\x04") || text.startsWith("%PDF"))) ? text : parseSource;

        if (isDummy(text) && fileToParse) {
            fetch("/api/resume/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileData: fileToParse,
                    resumeName: parseFileName,
                }),
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data.success && data.text && data.text.length > 25) {
                        const { structured: reStructured, suggestions: reSugs } = parseResumeTextToStructured(
                            data.text,
                            uName,
                            uRole,
                            uEmail,
                            report.suggestions
                        );
                        setStructuredResume(reStructured);
                        setSuggestions(reSugs);
                        setReport((prev) => ({ ...prev, resumeText: data.text, resumeName: parseFileName }));

                        // Update local storage so future page loads are instantaneous
                        try {
                            const lastFbRaw = localStorage.getItem("useladder_last_resume_feedback");
                            if (lastFbRaw) {
                                const parsed = JSON.parse(lastFbRaw);
                                parsed.resumeText = data.text;
                                parsed.resumeName = parseFileName;
                                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(parsed));
                            }
                            const userRaw = localStorage.getItem("useladder_user");
                            if (userRaw) {
                                const parsedUser = JSON.parse(userRaw);
                                if (parsedUser.resume) parsedUser.resume.rawText = data.text;
                                if (parsedUser.resumes?.[0]) parsedUser.resumes[0].rawText = data.text;
                                localStorage.setItem("useladder_user", JSON.stringify(parsedUser));
                            }
                        } catch {}
                    }
                })
                .catch(() => {});
        }

        return () => {
            window.removeEventListener("useladder_resume_scanned", handleScanUpdated);
        };
    }, [report.resumeName, report.resumeText, report.role, report.suggestions, initialData, structuredResume.name]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzingNewResume(true);
        setAnalyzeError(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            if (content && typeof content === "string" && (content.startsWith("data:") || content.startsWith("PK"))) {
                setUploadedDocxBase64(content);
            }
            try {
                let userEmail = "";
                let userName = structuredResume.name || "";
                if (typeof window !== "undefined") {
                    try {
                        const raw = localStorage.getItem("useladder_user");
                        if (raw) {
                            const u = JSON.parse(raw);
                            if (u.email) userEmail = u.email;
                            if (u.name) userName = u.name;
                        }
                    } catch {}
                }

                const res = await fetch("/api/resume/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileData: content,
                        resumeText: file.type.startsWith("text/") ? content : "",
                        resumeName: file.name,
                        role: report.role || "Product Manager",
                        domain: report.domain || "Product & Design",
                        email: userEmail,
                    }),
                });

                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || "Failed to parse and scan resume");
                }

                const cleanExtractedText = data.extractedText || content;
                const newScore = data.result?.score || 82;

                const newPayload = {
                    id: `cv_${Date.now()}`,
                    resumeName: file.name,
                    role: report.role || "Product Manager",
                    domain: report.domain || "Product & Design",
                    resumeText: cleanExtractedText,
                    fileData: content && typeof content === "string" && content.startsWith("data:") ? content : undefined,
                    score: newScore,
                    summary: data.result.summary || "",
                    strengths: data.result.strengths || [],
                    suggestions: data.result.suggestions || [],
                    missingKeywords: data.result.missingKeywords || [],
                    updatedAt: new Date().toISOString(),
                };

                setReport(newPayload);
                if (typeof window !== "undefined") {
                    localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(newPayload));
                }

                const { structured, suggestions: parsedSugs } = parseResumeTextToStructured(
                    cleanExtractedText,
                    userName,
                    report.role || "Product Manager",
                    userEmail,
                    data.result.suggestions
                );

                setStructuredResume(structured);
                setSuggestions(parsedSugs);
                if (parsedSugs.length > 0) {
                    setActiveSuggestionId(parsedSugs[0].id);
                }

                // Sync with useladder_user
                if (typeof window !== "undefined") {
                    const rawUser = localStorage.getItem("useladder_user");
                    if (rawUser) {
                        try {
                            const parsedUser = JSON.parse(rawUser);
                            const newResumeItem = {
                                id: newPayload.id,
                                name: file.name,
                                data: content,
                                rawText: cleanExtractedText,
                                score: newScore,
                                updatedAt: new Date().toISOString(),
                            };
                            const existing = Array.isArray(parsedUser.resumes) ? parsedUser.resumes : [];
                            parsedUser.resumes = [newResumeItem, ...existing.filter((r: any) => r.id !== newResumeItem.id)];
                            parsedUser.selectedResumeId = newResumeItem.id;
                            parsedUser.resume = newResumeItem;
                            localStorage.setItem("useladder_user", JSON.stringify(parsedUser));
                        } catch {}
                    }
                }
            } catch (err: any) {
                console.error("Direct upload failed:", err);
                setAnalyzeError(err?.message || "Failed to parse resume file.");
            } finally {
                setIsAnalyzingNewResume(false);
            }
        };

        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    };

    const handlePasteSubmit = async () => {
        if (!pastedText.trim() || pastedText.trim().length < 25) {
            setAnalyzeError("Please paste at least a few sentences of your resume text.");
            return;
        }

        setIsAnalyzingNewResume(true);
        setAnalyzeError(null);
        setIsPasteModalOpen(false);

        try {
            let userEmail = "";
            let userName = structuredResume.name || "";
            if (typeof window !== "undefined") {
                try {
                    const raw = localStorage.getItem("useladder_user");
                    if (raw) {
                        const u = JSON.parse(raw);
                        if (u.email) userEmail = u.email;
                        if (u.name) userName = u.name;
                    }
                } catch {}
            }

            const res = await fetch("/api/resume/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resumeText: pastedText.trim(),
                    resumeName: "Pasted_Resume.txt",
                    role: report.role || "Product Manager",
                    domain: report.domain || "Product & Design",
                    email: userEmail,
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to analyze resume text");
            }

            const cleanExtractedText = data.extractedText || pastedText.trim();
            const newScore = data.result?.score || 82;

            const newPayload = {
                id: `cv_${Date.now()}`,
                resumeName: "Pasted_Resume.txt",
                role: report.role || "Product Manager",
                domain: report.domain || "Product & Design",
                resumeText: cleanExtractedText,
                score: newScore,
                summary: data.result.summary || "",
                strengths: data.result.strengths || [],
                suggestions: data.result.suggestions || [],
                missingKeywords: data.result.missingKeywords || [],
                updatedAt: new Date().toISOString(),
            };

            setReport(newPayload);
            if (typeof window !== "undefined") {
                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(newPayload));
            }

            const { structured, suggestions: parsedSugs } = parseResumeTextToStructured(
                cleanExtractedText,
                userName,
                report.role || "Product Manager",
                userEmail,
                data.result.suggestions
            );

            setStructuredResume(structured);
            setSuggestions(parsedSugs);
            if (parsedSugs.length > 0) {
                setActiveSuggestionId(parsedSugs[0].id);
            }

            // Sync with useladder_user
            if (typeof window !== "undefined") {
                const rawUser = localStorage.getItem("useladder_user");
                if (rawUser) {
                    try {
                        const parsedUser = JSON.parse(rawUser);
                        const newResumeItem = {
                            id: newPayload.id,
                            name: "Pasted_Resume.txt",
                            data: cleanExtractedText,
                            rawText: cleanExtractedText,
                            score: newScore,
                            updatedAt: new Date().toISOString(),
                        };
                        const existing = Array.isArray(parsedUser.resumes) ? parsedUser.resumes : [];
                        parsedUser.resumes = [newResumeItem, ...existing.filter((r: any) => r.id !== newResumeItem.id)];
                        parsedUser.selectedResumeId = newResumeItem.id;
                        parsedUser.resume = newResumeItem;
                        localStorage.setItem("useladder_user", JSON.stringify(parsedUser));
                    } catch {}
                }
            }
        } catch (err: any) {
            console.error("Paste scan failed:", err);
            setAnalyzeError(err?.message || "Failed to scan pasted resume.");
        } finally {
            setIsAnalyzingNewResume(false);
        }
    };

    // Calculate dynamic live score based on applied improvements
    const baseScore = report.score || 82;
    const addedScore = suggestions
        .filter((s) => s.applied)
        .reduce((sum, s) => sum + s.scoreLift, 0);
    const currentScore = Math.min(100, baseScore + addedScore);

    const appliedCount = suggestions.filter((s) => s.applied).length;
    const totalCount = suggestions.length;

    // Scroll to and highlight targeted bullet in document
    const handleSelectSuggestion = (sugId: string) => {
        setActiveSuggestionId(sugId);
        const sug = suggestions.find((s) => s.id === sugId);
        if (!sug) return;

        // Find matching bullet ID
        for (const job of structuredResume.jobs) {
            const foundBullet = job.bullets.find((b) => b.suggestionId === sugId || b.text.includes(sug.targetSnippet.slice(0, 30)));
            if (foundBullet && bulletRefs.current[foundBullet.id]) {
                bulletRefs.current[foundBullet.id]?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
                break;
            }
        }
    };

    // Apply specific improvement
    const handleApplyImprovement = (sugId: string) => {
        const sug = suggestions.find((s) => s.id === sugId);
        if (!sug) return;

        // Update document bullets
        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    if (b.suggestionId === sugId || b.text.includes(sug.targetSnippet.slice(0, 30))) {
                        return { ...b, text: sug.proposedText };
                    }
                    return b;
                }),
            })),
        }));

        // Mark suggestion as applied
        setSuggestions((prev) =>
            prev.map((s) => (s.id === sugId ? { ...s, applied: true } : s))
        );
    };

    const handleUndoImprovement = (sugId: string) => {
        const sug = suggestions.find((s) => s.id === sugId);
        if (!sug) return;
        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    if (b.suggestionId === sugId || b.text === sug.proposedText || b.text.includes(sug.proposedText.slice(0, 30))) {
                        return { ...b, text: sug.targetSnippet };
                    }
                    return b;
                }),
            })),
        }));
        setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: false } : s)));
    };

    // Apply all improvements at once
    const handleApplyAll = () => {
        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    const matchedSug = suggestions.find(
                        (s) => s.id === b.suggestionId || b.text.includes(s.targetSnippet.slice(0, 30))
                    );
                    if (matchedSug) {
                        return { ...b, text: matchedSug.proposedText };
                    }
                    return b;
                }),
            })),
        }));

        setSuggestions((prev) => prev.map((s) => ({ ...s, applied: true })));
    };

    // Standardized Resume Generator — EB Garamond widely accepted template
    const handleDownloadDocx = async () => {
        try {
            const {
                Document,
                Packer,
                Paragraph,
                TextRun,
                Tab,
                HeadingLevel,
                AlignmentType,
                ExternalHyperlink,
                TabStopType,
                BorderStyle,
            } = await import("docx");

            const standardizedFont = "EB Garamond";
            const withFont = (opts: any) => ({ font: standardizedFont, ...opts });

            const sectionBorder = {
                bottom: {
                    color: "0F172A",
                    space: 4,
                    style: BorderStyle.SINGLE,
                    size: 8,
                },
            };

            const linkRuns = (text: string, baseOpts: any): (InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>)[] => {
                if (!text) return [new TextRun(withFont({ text: "", ...baseOpts }))];
                const out: any[] = [];
                const regex = /([^\s|·•()]+(?:\s+[^\s|·•()]+)?)\s*\(((?:https?:\/\/|mailto:)[^)]+)\)|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)|(mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
                let last = 0;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(text)) !== null) {
                    const match = m[0];
                    const idx = m.index;
                    if (idx > last) out.push(new TextRun(withFont({ text: text.slice(last, idx), ...baseOpts })));

                    let disp = "";
                    let href = "";
                    if (m[1] && m[2]) {
                        disp = m[1].trim();
                        href = m[2].trim();
                    } else if (m[3] && m[4]) {
                        disp = m[3].trim();
                        href = m[4].trim();
                    } else if (m[5]) {
                        disp = m[5].replace(/^mailto:/i, "").trim();
                        href = m[5].trim();
                    } else if (m[6]) {
                        disp = m[6].trim();
                        href = `mailto:${m[6].trim()}`;
                    } else if (m[7]) {
                        disp = m[7].trim();
                        href = m[7].startsWith("http") ? m[7] : `https://${m[7]}`;
                    }

                    if (disp && href) {
                        out.push(
                            new ExternalHyperlink({
                                children: [new TextRun(withFont({ text: disp, ...baseOpts, color: "1D4ED8", underline: {} }))],
                                link: href,
                            })
                        );
                    } else {
                        out.push(new TextRun(withFont({ text: match, ...baseOpts })));
                    }
                    last = idx + match.length;
                }
                if (last < text.length) out.push(new TextRun(withFont({ text: text.slice(last), ...baseOpts })));
                return out.length ? out : [new TextRun(withFont({ text, ...baseOpts }))];
            };

            const sectionsRender: any[] = [];

            // 1. Header (Name, Subtitle, Contact with bottom divider line)
            sectionsRender.push(
                new Paragraph({
                    children: linkRuns(displayResume.name, { bold: true, size: 28, color: "0F172A" }),
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 40 },
                })
            );
            if (displayResume.headline && !displayResume.headline.includes("· Professional Profile")) {
                sectionsRender.push(
                    new Paragraph({
                        children: linkRuns(displayResume.headline, { size: 20, color: "334155" }),
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 30 },
                    })
                );
            }
            sectionsRender.push(
                new Paragraph({
                    children: linkRuns(displayResume.contact, { size: 18, color: "334155" }),
                    alignment: AlignmentType.CENTER,
                    border: {
                        bottom: {
                            color: "94A3B8",
                            space: 6,
                            style: BorderStyle.SINGLE,
                            size: 6,
                        },
                    },
                    spacing: { after: 180 },
                })
            );

            // 2. Summary
            if (displayResume.summary && displayResume.summary.trim()) {
                sectionsRender.push(
                    new Paragraph({
                        children: [new TextRun(withFont({ text: displayResume.summaryTitle || "PROFESSIONAL SUMMARY", bold: true, size: 20, color: "0F172A" }))],
                        heading: HeadingLevel.HEADING_2,
                        border: sectionBorder,
                        spacing: { before: 180, after: 100 },
                    }),
                    new Paragraph({
                        children: linkRuns(displayResume.summary, { size: 20 }),
                        spacing: { after: 200 },
                    })
                );
            }

            // 3. Experience Jobs grouped by sectionTitle
            let lastSectionHeader = "";
            displayResume.jobs.forEach((job) => {
                const sTitle = job.sectionTitle || resolveExperienceTitle(displayResume.experienceTitle, displayResume.headline, displayResume.name);
                if (sTitle && sTitle !== lastSectionHeader) {
                    lastSectionHeader = sTitle;
                    sectionsRender.push(
                        new Paragraph({
                            children: [new TextRun(withFont({ text: sTitle.toUpperCase(), bold: true, size: 20, color: "0F172A" }))],
                            heading: HeadingLevel.HEADING_2,
                            border: sectionBorder,
                            spacing: { before: 200, after: 120 },
                        })
                    );
                }

                const rightTabStop = {
                    type: TabStopType.RIGHT,
                    position: 10800, // Right margin at 7.5 inches (7.5 * 1440 = 10800 dxa)
                };

                const hasCompany = job.company && !/^(Professional Experience|Primary Experience|Company)$/i.test(job.company);
                const jobHeaderRuns: any[] = [
                    new TextRun(withFont({ text: job.title, bold: true, size: 21, color: "0F172A" })),
                ];

                if (hasCompany) {
                    jobHeaderRuns.push(
                        new TextRun(withFont({ text: "   |   ", size: 20, color: "64748B" })),
                        new TextRun(withFont({ text: job.company, size: 21, color: "0F172A" }))
                    );
                }

                if (job.date) {
                    jobHeaderRuns.push(
                        new Tab(),
                        new TextRun(withFont({ text: job.date, bold: true, size: 20, color: "1E293B" }))
                    );
                }

                sectionsRender.push(
                    new Paragraph({
                        tabStops: [rightTabStop],
                        children: jobHeaderRuns,
                        spacing: { before: 140, after: 30 },
                    })
                );

                if (job.projectHeaders && job.projectHeaders.length > 0 && !job.bullets.some((b) => b.projectHeader)) {
                    job.projectHeaders.forEach((ph) => {
                        sectionsRender.push(
                            new Paragraph({
                                children: linkRuns(ph, { size: 19, bold: true, color: "0F172A" }),
                                spacing: { before: 80, after: 40 },
                            })
                        );
                    });
                }

                if (job.companyDescription) {
                    sectionsRender.push(
                        new Paragraph({
                            children: linkRuns(job.companyDescription, { size: 18, color: "334155", italics: true }),
                            spacing: { before: 40, after: 60 },
                        })
                    );
                }

                let lastPhDocx = "";
                job.bullets.forEach((b) => {
                    if (b.projectHeader && b.projectHeader !== lastPhDocx) {
                        lastPhDocx = b.projectHeader;
                        sectionsRender.push(
                            new Paragraph({
                                children: linkRuns(lastPhDocx, { size: 20, bold: true, color: "0F172A" }),
                                spacing: { before: 120, after: 40 },
                            })
                        );
                    }
                    const runs = linkRuns(b.text, { size: 19 });
                    sectionsRender.push(
                        new Paragraph({
                            children: [new TextRun(withFont({ text: "•  ", size: 19 })), ...runs],
                            spacing: { after: 40 },
                            indent: { left: 360, hanging: 180 },
                        })
                    );
                });

                sectionsRender.push(new Paragraph({ text: "", spacing: { after: 60 } }));
            });

            // 4. Competencies / Skills & Tools
            if (displayResume.skills && displayResume.skills.length > 0) {
                sectionsRender.push(
                    new Paragraph({
                        children: [new TextRun(withFont({ text: (displayResume.skillsTitle || "CORE COMPETENCIES").toUpperCase(), bold: true, size: 20, color: "0F172A" }))],
                        heading: HeadingLevel.HEADING_2,
                        border: sectionBorder,
                        spacing: { before: 200, after: 120 },
                    })
                );
                displayResume.skills.forEach((sk) => {
                    const isTools = /tools/i.test(sk.category);
                    if (isTools) {
                        sectionsRender.push(
                            new Paragraph({
                                children: [new TextRun(withFont({ text: "TOOLS", bold: true, size: 20, color: "0F172A" }))],
                                heading: HeadingLevel.HEADING_2,
                                border: sectionBorder,
                                spacing: { before: 180, after: 100 },
                            })
                        );
                    }
                    const catRun = sk.category && !/^(Technical Skills|Core Skills)$/i.test(sk.category)
                        ? new TextRun(withFont({ text: `${sk.category}: `, bold: true, size: 19 }))
                        : null;
                    const itemRuns = linkRuns(sk.items, { size: 19 });
                    sectionsRender.push(
                        new Paragraph({
                            children: [new TextRun(withFont({ text: "•  ", size: 19 })), ...(catRun ? [catRun] : []), ...itemRuns],
                            spacing: { after: 40 },
                            indent: { left: 360, hanging: 180 },
                        })
                    );
                });
            }

            // 5. Education & Certifications
            if (displayResume.education && displayResume.education.length > 0) {
                sectionsRender.push(
                    new Paragraph({
                        children: [new TextRun(withFont({ text: "EDUCATION AND CERTIFICATIONS", bold: true, size: 20, color: "0F172A" }))],
                        heading: HeadingLevel.HEADING_2,
                        border: sectionBorder,
                        spacing: { before: 200, after: 120 },
                    })
                );
                const rightTabStop = {
                    type: TabStopType.RIGHT,
                    position: 10800,
                };
                displayResume.education.forEach((edu) => {
                    sectionsRender.push(
                        new Paragraph({
                            tabStops: [rightTabStop],
                            children: [
                                new TextRun(withFont({ text: edu.institution, bold: true, size: 20, color: "0F172A" })),
                                ...(edu.date
                                    ? [
                                          new Tab(),
                                          new TextRun(withFont({ text: edu.date, bold: true, size: 19, color: "0F172A" })),
                                      ]
                                    : []),
                            ],
                            spacing: { before: 100, after: 20 },
                        })
                    );
                    if (edu.degree) {
                        sectionsRender.push(
                            new Paragraph({
                                children: [new TextRun(withFont({ text: edu.degree, size: 19, color: "334155" }))],
                                spacing: { after: 20 },
                            })
                        );
                    }
                    if (edu.details) {
                        sectionsRender.push(
                            new Paragraph({
                                children: [new TextRun(withFont({ text: edu.details, size: 19, color: "475569" }))],
                                spacing: { after: 40 },
                            })
                        );
                    }
                    sectionsRender.push(new Paragraph({ text: "", spacing: { after: 40 } }));
                });
            }

            const doc = new Document({
                sections: [
                    {
                        properties: {
                            page: {
                                size: {
                                    width: 12240,
                                    height: 15840,
                                },
                                margin: {
                                    top: 720,
                                    right: 720,
                                    bottom: 720,
                                    left: 720,
                                },
                            },
                        },
                        children: sectionsRender,
                    },
                ],
            });

            const blob = await Packer.toBlob(doc);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(displayResume.name || "Resume").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setCopiedDoc(true);
            setTimeout(() => setCopiedDoc(false), 2000);
        } catch (genErr) {
            console.error("DOCX generation error:", genErr);
            setAnalyzeError("Failed to generate .docx. Please try again.");
        }
    };

    // Save current document to user profile
    const handleSaveToProfile = async () => {
        const fullMarkdown = `# ${structuredResume.name}\n${structuredResume.headline}\n\n## Experience\n` +
            structuredResume.jobs.map(j => `### ${j.title} | ${j.company}\n` + j.bullets.map(b => `- ${b.text}`).join("\n")).join("\n\n");

        if (typeof window !== "undefined") {
            try {
                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    const parsed = JSON.parse(userRaw);
                    const resumeItem = {
                        id: report.id || `cv_${Date.now()}`,
                        name: report.resumeName || "Improved_Resume.md",
                        data: fullMarkdown,
                        score: currentScore,
                        updatedAt: new Date().toISOString(),
                    };
                    const existing = Array.isArray(parsed.resumes) ? parsed.resumes : [];
                    parsed.resumes = [resumeItem, ...existing.filter((r: { id: string }) => r.id !== resumeItem.id)];
                    parsed.selectedResumeId = resumeItem.id;
                    parsed.resume = resumeItem;
                    localStorage.setItem("useladder_user", JSON.stringify(parsed));

                    // Update last feedback
                    const updatedPayload = { ...report, score: currentScore, resumeText: fullMarkdown };
                    localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(updatedPayload));
                    setReport(updatedPayload);

                    // Sync to MongoDB
                    await fetch("/api/profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: parsed.email,
                            role: parsed.role || report.role,
                            domain: parsed.domain || report.domain,
                            resumes: parsed.resumes,
                            selectedResumeId: parsed.selectedResumeId,
                        }),
                    });
                }
            } catch (err) {
                console.error("Failed to save resume:", err);
            }
        }

        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
    };

    const handleCopyKeyword = (keyword: string) => {
        navigator.clipboard.writeText(keyword);
        setCopiedKeyword(keyword);
        setTimeout(() => setCopiedKeyword(null), 2000);
    };

    const handleInfuseKeyword = async (keyword: string) => {
        if (infusingKeyword) return;
        setInfuseError(null);
        setInfusingKeyword(keyword);
        try {
            const fullResumeText =
                report.resumeText && report.resumeText.length > 40
                    ? report.resumeText
                    : structuredResume.jobs.map((j) => `${j.title} at ${j.company}\n${j.bullets.map((b) => `- ${b.text}`).join("\n")}`).join("\n\n");

            const res = await fetch("/api/resume/infuse-keyword", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resumeText: fullResumeText,
                    keyword,
                    role: report.role || "Product Manager",
                    domain: (report as any).domain || "Product & Design",
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to fuse keyword");
            const result = data.result as { alreadyPresent: boolean; originalText: string; revisedText: string; explanation: string; targetJob?: string };
            if (result.alreadyPresent) {
                setInfusedKeywords((prev) => new Set(prev).add(keyword));
                setInfuseError(`"${keyword}" already appears in your resume — no fusion needed.`);
                return;
            }
            if (!result.originalText || !result.revisedText) throw new Error("Model returned empty fusion");

            // Create an implementable suggestion — fused neatly into existing experience
            const sugId = `infuse-${keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString().slice(-4)}`;
            // Find target bullet index to highlight
            const allBullets = structuredResume.jobs.flatMap((j, jIdx) => j.bullets.map((b, bIdx) => ({ ...b, jIdx, bIdx, job: j })));
            const target = allBullets.find(
                (b) => b.text === result.originalText || b.text.includes(result.originalText.slice(0, 32)) || result.originalText.includes(b.text.slice(0, 32))
            );
            if (target) {
                setStructuredResume((prev) => ({
                    ...prev,
                    jobs: prev.jobs.map((job, idx) =>
                        idx !== target.jIdx
                            ? job
                            : {
                                  ...job,
                                  bullets: job.bullets.map((bb, bi) => (bi === target.bIdx ? { ...bb, suggestionId: sugId } : bb)),
                              }
                    ),
                }));
            }
            const jobLabel = result.targetJob || (target ? `${target.job.title} — ${target.job.company}` : "experience");
            const newSug: SuggestionItem = {
                id: sugId,
                category: "Role Alignment",
                title: `Add "${keyword}" to improve ATS matching`,
                feedback: result.explanation || `This keyword was missing for ATS. Woven neatly into your existing ${jobLabel.toLowerCase()} bullet.`,
                recommendation: `Review where "${keyword}" was added to “${result.originalText.slice(0, 64)}…” and Implement if the reconstruction reads naturally.`,
                targetSnippet: result.originalText,
                proposedText: result.revisedText,
                scoreLift: 2,
                applied: false,
                fusedKeyword: keyword,
                targetJobLabel: jobLabel,
            };
            setSuggestions((prev) => [newSug, ...prev]);
            setActiveSuggestionId(sugId);
            setInfusedKeywords((prev) => new Set(prev).add(keyword));
            // Scroll to target
            setTimeout(() => handleSelectSuggestion(sugId), 250);
        } catch (e: any) {
            setInfuseError(e.message || "Failed to fuse keyword");
        } finally {
            setInfusingKeyword(null);
        }
    };

    const highlightKeyword = (text: string, keyword?: string) => {
        if (!keyword || !text.toLowerCase().includes(keyword.toLowerCase())) return text;
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + keyword.length);
        const after = text.slice(idx + keyword.length);
        return (
            <>
                {before}
                <span style={{ background: "#FEF08A", padding: "0 2px", borderRadius: 3, fontWeight: 700, color: "#854D0E", border: "1px solid #FDE68A" }}>{match}</span>
                {after}
            </>
        );
    };

    const renderWithLinks = (text: string) => {
        if (!text) return text;
        const parts: React.ReactNode[] = [];
        let last = 0;
        const regex = /([^\s|·•()]+(?:\s+[^\s|·•()]+)?)\s*\(((?:https?:\/\/|mailto:)[^)]+)\)|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)|(mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
        let m: RegExpExecArray | null;
        let key = 0;
        while ((m = regex.exec(text)) !== null) {
            const match = m[0];
            const idx = m.index;
            if (idx > last) parts.push(text.slice(last, idx));

            let disp = "";
            let href = "";
            if (m[1] && m[2]) {
                disp = m[1].trim();
                href = m[2].trim();
            } else if (m[3] && m[4]) {
                disp = m[3].trim();
                href = m[4].trim();
            } else if (m[5]) {
                disp = m[5].replace(/^mailto:/i, "").trim();
                href = m[5].trim();
            } else if (m[6]) {
                disp = m[6].trim();
                href = `mailto:${m[6].trim()}`;
            } else if (m[7]) {
                disp = m[7].trim();
                href = m[7].startsWith("http") ? m[7] : `https://${m[7]}`;
            }

            if (disp && href) {
                const isMail = href.startsWith("mailto:");
                parts.push(
                    <a
                        key={`link-${key++}`}
                        href={href}
                        target={isMail ? undefined : "_blank"}
                        rel={isMail ? undefined : "noreferrer"}
                        style={{ color: "#2563EB", textDecoration: "underline", wordBreak: "break-all" }}
                    >
                        {disp}
                    </a>
                );
            } else {
                parts.push(match);
            }
            last = idx + match.length;
        }
        if (last < text.length) parts.push(text.slice(last));
        return parts.length > 0 ? <>{parts}</> : text;
    };

    const displayResume = useMemo(() => normalizeStructuredForDisplay(structuredResume), [structuredResume]);
    const isDocLoading = !hasMounted || isAnalyzingNewResume || !displayResume.name || displayResume.jobs.length === 0;

    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (currentScore / 100) * circumference;

    const verdict = currentScore >= 90 ? "Top 5% Resume" : currentScore >= 80 ? "Strong Candidate" : "Needs Polish";
    const verdictClass =
        currentScore >= 80
            ? styles.verdictGood
            : currentScore >= 65
            ? styles.verdictAvg
            : styles.verdictNeedsWork;

    return (
        <div className={styles.feedbackPage}>
            {/* Top Navigation — clean: only branding + back */}
            <nav className={styles.navbar}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <FileText size={18} weight="bold" />
                    </div>
                    <span>useladder</span>
                </div>
                <div className={styles.navActions}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.doc,.txt,.md"
                        style={{ display: "none" }}
                    />
                    <button
                        type="button"
                        className={styles.backBtn}
                        onClick={() => router.push("/dashboard")}
                    >
                        <ArrowLeft size={14} weight="regular" />
                        Back to Dashboard
                    </button>
                </div>
            </nav>

            <main className={styles.mainContainer}>
                {/* ── Window Header ── */}
                <div className={styles.windowHeader}>
                    <div className={styles.windowTitleGroup}>
                        <h1 className={styles.windowTitle}>Resume / CV In-Line Feedback & Improver</h1>
                        <p className={styles.windowSubtitle}>
                            {isDocLoading
                                ? "Auditing ATS metrics and loading candidate history..."
                                : `File: ${report.resumeName || "Uploaded Resume"} · Target Role: ${report.role || "Software Engineer"}`}
                        </p>
                    </div>
                    {isModal && onClose && (
                        <button
                            type="button"
                            className={styles.windowCloseBtn}
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <X size={15} weight="regular" />
                        </button>
                    )}
                </div>

                {/* ── Performance Summary Banner (Unified Header) ── */}
                <div className={styles.summaryBanner}>
                    <div className={styles.scoreCircleWrap}>
                        <svg className={styles.scoreSvg} viewBox="0 0 100 100">
                            <circle className={styles.scoreTrack} cx="50" cy="50" r={radius} />
                            <circle
                                className={styles.scoreFill}
                                cx="50"
                                cy="50"
                                r={radius}
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                stroke={currentScore >= 80 ? "#16A34A" : currentScore >= 65 ? "#F59E0B" : "#DC2626"}
                            />
                        </svg>
                        <div className={styles.scoreCenter}>
                            <span className={styles.scoreNumber}>{currentScore}</span>
                            <span className={styles.scoreOutOf}>/ 100</span>
                        </div>
                    </div>

                    <div className={styles.summaryContent}>
                        <div className={styles.summaryTopRow}>
                            <span className={`${styles.verdictBadge} ${verdictClass}`}>
                                <Check size={12} weight="regular" />
                                {verdict}
                            </span>
                        </div>

                        <p className={styles.summaryParagraph}>
                            {report.summary || "Your resume displays solid technical depth. Select any suggestion on the left to highlight and implement Google X-Y-Z bullet points directly into your document on the right."}
                        </p>

                        <div className={styles.rubricRow}>
                            <div className={styles.rubricPill}>
                                <span>Impact & Metrics:</span>
                                <span className={styles.rubricVal}>
                                    {Math.min(98, (report.metrics?.impactScore ?? 84) + appliedCount * 3)}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Role Alignment:</span>
                                <span className={styles.rubricVal}>
                                    {Math.min(96, (report.metrics?.roleAlignmentScore ?? 88) + (appliedCount > 0 ? 4 : 0))}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Action Verbs:</span>
                                <span className={styles.rubricVal}>
                                    {Math.min(95, (report.metrics?.brevityScore ?? 80) + appliedCount * 3)}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Structure & ATS:</span>
                                <span className={styles.rubricVal}>92%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Single Unified Workspace: Suggestions Left, Document Right ── */}
                <div className={styles.unifiedWorkspace}>
                    <div className={styles.unifiedGrid}>
                        {/* ── LEFT COLUMN: Actionable Suggestions ── */}
                        <div className={styles.suggestionsSidebar}>
                            <div className={styles.suggestionsToolbar}>
                                <span className={styles.suggestionsCountLabel}>
                                    <span>
                                        {appliedCount} of {totalCount} improvements applied
                                    </span>
                                </span>
                                {appliedCount < totalCount && (
                                    <button
                                        type="button"
                                        className={styles.suggestionsApplyAllBtn}
                                        onClick={handleApplyAll}
                                        title="Apply all suggested Google X-Y-Z bullets to document"
                                    >
                                        Apply All
                                    </button>
                                )}
                            </div>

                            {/* Suggestions List — identical rewrites are filtered, section is marked okay */}
                            {isDocLoading ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className={styles.docSkeletonCard} style={{ height: "115px", borderRadius: "10px" }} />
                                    ))}
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", borderRadius: 10, padding: "0.9rem 1rem", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <CheckCircle size={18} weight="fill" color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#166534" }}>Section is okay — no rewrite needed</div>
                                        <div style={{ fontSize: "0.76rem", color: "#15803D", lineHeight: 1.45, marginTop: 3 }}>Your experience bullets are already strong (rated 7/10+). Company descriptions are shown as muted text and not scored. Only weaker bullets would appear here.</div>
                                    </div>
                                </div>
                            ) : null}
                            {!isDocLoading && suggestions.map((sug) => {
                                const isActive = activeSuggestionId === sug.id;
                                const isApplied = sug.applied;
                                const isKeywordAddition = !!sug.fusedKeyword;
                                const pillClass = isKeywordAddition
                                    ? styles.suggestionPillImpact
                                    : sug.category === "Impact & Metrics"
                                    ? styles.suggestionPillImpact
                                    : sug.category === "Action Verbs & Brevity"
                                    ? styles.suggestionPillVerbs
                                    : styles.suggestionPillKeywords;

                                const displayCategory = isKeywordAddition
                                    ? "keyword addition"
                                    : sug.category === "Impact & Metrics"
                                    ? "Impact"
                                    : sug.category === "Action Verbs & Brevity"
                                    ? "Clarity"
                                    : sug.category;
                                return (
                                    <div
                                        key={sug.id}
                                        className={`${styles.suggestionCard} ${isActive ? styles.suggestionCardActive : ""} ${isApplied ? styles.suggestionCardApplied : ""}`}
                                        onClick={() => handleSelectSuggestion(sug.id)}
                                    >
                                        <div className={styles.suggestionTopRow}>
                                            <span className={`${styles.suggestionCategoryPill} ${pillClass}`} style={{ background: "transparent", border: "none", padding: 0 }}>
                                                {displayCategory}
                                            </span>
                                            {isApplied && (
                                                <span className={styles.suggestionAppliedBadge}>
                                                    <CheckCircle size={13} weight="fill" />
                                                    Implemented
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                            <span title={sug.feedback} style={{ display: "inline-flex", cursor: "help", color: "#94A3B8" }}>
                                                <Info size={14} weight="regular" />
                                            </span>
                                            <h4 className={styles.suggestionTitle} style={{ margin: 0 }}>
                                                {(() => {
                                                    const cat = String(sug.category);
                                                    if (cat === "Action Verbs & Brevity" || cat === "Clarity") return "Rewrite to emphasize product ownership, user validation";
                                                    if (cat === "Impact & Metrics" || cat === "Impact") return "Rewrite to emphasize measurable impact and scale";
                                                    return sug.title;
                                                })()}
                                            </h4>
                                        </div>


                                        {/* Original — full, red callout, Inter */}
                                        <div className={styles.suggestionTargetSnippet} title="Original" style={{ background: "#FEF2F2", borderLeft: "2px solid #EF4444", color: "#991B1B", display: "block", WebkitLineClamp: "unset", overflow: "visible", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#DC2626", display: "block", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Original</span>
                                            &ldquo;{sug.targetSnippet}&rdquo;
                                        </div>

                                        {/* Improvement — green bg */}
                                        <div className={styles.suggestionProposedBox}>
                                            <strong>Improvement:</strong>{" "}
                                            {sug.fusedKeyword ? highlightKeyword(sug.proposedText, sug.fusedKeyword) : sug.proposedText}
                                        </div>

                                        <div className={styles.suggestionActionRow}>
                                            <span style={{ fontSize: "0.74rem", color: "#64748B" }}>
                                                {isApplied ? "Applied — click Undo to revert" : isActive ? "Highlighting in document →" : "Click to view in document"}
                                            </span>
                                            {isApplied ? (
                                                <button
                                                    type="button"
                                                    className={styles.improverActionSmallBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUndoImprovement(sug.id);
                                                    }}
                                                >
                                                    Undo
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={styles.suggestionApplyBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleApplyImprovement(sug.id);
                                                    }}
                                                >
                                                    <Check size={13} weight="bold" />
                                                    Implement
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Missing Keywords Box — now with Fuse into experience */}
                            {report.missingKeywords && report.missingKeywords.length > 0 && (
                                <div style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "10px", padding: "1rem" }}>
                                    <div style={{ marginBottom: "0.5rem" }}>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0F172A" }}>
                                            Missing High-Impact Keywords
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "#64748B", margin: "0 0 0.65rem", lineHeight: 1.4 }}>
                                        ATS bots scan for these. <span style={{ color: "#0F172A", fontWeight: 600 }}>Copy</span> or <span style={{ color: "#475569", fontWeight: 600 }}>Add</span> it neatly into an existing experience bullet — no new bullet, just a natural weave.
                                    </p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                                        {report.missingKeywords.map((kw, i) => {
                                            const isCopied = copiedKeyword === kw;
                                            const isFused = infusedKeywords.has(kw);
                                            const isInfusing = infusingKeyword === kw;
                                            return (
                                                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: isFused ? "#F0FDF4" : "#FFFFFF", border: `1px solid ${isFused ? "#DCFCE7" : "#E4E4E7"}`, borderRadius: 7, padding: "0.2rem 0.35rem 0.2rem 0.45rem" }}>
                                                    <span style={{ fontSize: "0.74rem", fontWeight: 600, color: isFused ? "#15803D" : "#0F172A" }}>{kw}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyKeyword(kw)}
                                                        title="Copy keyword"
                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 5, border: "1px solid #E2E8F0", background: "#FFFFFF", cursor: "pointer", color: isCopied ? "#16A34A" : "#64748B" }}
                                                    >
                                                        {isCopied ? <Check size={11} weight="bold" /> : <Copy size={11} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleInfuseKeyword(kw)}
                                                        disabled={!!infusingKeyword || isFused}
                                                        title={isFused ? "Already added — see suggestion card" : `Add "${kw}" into best experience bullet`}
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 3,
                                                            padding: "0.2rem 0.45rem",
                                                            borderRadius: 5,
                                                            border: "1px solid #E2E8F0",
                                                            background: isFused ? "#DCFCE7" : "#FFFFFF",
                                                            color: isFused ? "#15803D" : "#64748B",
                                                            fontSize: "0.68rem",
                                                            fontWeight: 700,
                                                            cursor: isFused || !!infusingKeyword ? "default" : "pointer",
                                                            opacity: isFused ? 0.9 : 1,
                                                        }}
                                                    >
                                                        {isInfusing ? (
                                                            <SpinnerGap size={11} style={{ animation: "spin 1s linear infinite" }} />
                                                        ) : isFused ? (
                                                            <CheckCircle size={11} weight="fill" />
                                                        ) : (
                                                            <Plus size={11} weight="bold" color="#94A3B8" />
                                                        )}
                                                        <span>{isInfusing ? "Adding…" : isFused ? "Added" : "Add"}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {infuseError && (
                                        <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: infuseError.includes("already appears") ? "#15803D" : "#B91C1C", background: infuseError.includes("already appears") ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${infuseError.includes("already appears") ? "#DCFCE7" : "#FECACA"}`, padding: "0.45rem 0.6rem", borderRadius: 6, lineHeight: 1.4 }}>
                                            {infuseError}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>

                        {/* ── RIGHT COLUMN: Structured Resume Document ── */}
                        <div className={styles.documentContainer}>
                            {/* Document Toolbar — only Save + Download */}
                            <div className={styles.documentPaperToolbar} style={{ justifyContent: "flex-end" }}>
                                <div className={styles.docToolbarActions}>
                                    <button
                                        type="button"
                                        className={styles.improverActionSmallBtn}
                                        onClick={handleSaveToProfile}
                                        style={{ background: "linear-gradient(135deg, #4782F6 0%, #3B71E8 100%)", color: "#FFFFFF", borderColor: "transparent", boxShadow: "0 4px 14px rgba(71, 130, 246, 0.22)" }}
                                        title="Save to active resume"
                                    >
                                        Save to Profile
                                    </button>
                                    <button
                                        type="button"
                                        id="download-docx-btn"
                                        className={styles.improverActionSmallBtn}
                                        onClick={handleDownloadDocx}
                                        style={{ background: "linear-gradient(135deg, #4782F6 0%, #3B71E8 100%)", color: "#FFFFFF", borderColor: "transparent", boxShadow: "0 4px 14px rgba(71, 130, 246, 0.22)" }}
                                        title="Download as Word (.docx)"
                                    >
                                        {copiedDoc ? "Downloaded" : "Download (.docx)"}
                                    </button>
                                </div>
                            </div>

                            {savedSuccess && (
                                <div style={{ color: "#15803D", background: "#F0FDF4", border: "1px solid #DCFCE7", padding: "0.55rem 0.85rem", borderRadius: 7, fontSize: "0.78rem" }}>
                                    ✓ Document saved to your active profile and synced with your account!
                                </div>
                            )}

                            {analyzeError && (
                                <div style={{ color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", padding: "0.55rem 0.85rem", borderRadius: 7, fontSize: "0.78rem", marginBottom: "0.75rem" }}>
                                    {analyzeError}
                                </div>
                            )}

                            {/* Document Paper — font preserved from original docx, normalized for display */}
                            {isDocLoading ? (
                                <div className={styles.documentPaper} style={{ minHeight: "750px", padding: "2.75rem 3rem" }}>
                                    {/* Animated Skeleton Header */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.65rem", borderBottom: "1.5px solid #F1F5F9", paddingBottom: "1.25rem", marginBottom: "1.75rem" }}>
                                        <div className={styles.docSkeletonLine} style={{ width: "38%", height: "26px", borderRadius: "6px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "55%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "45%", height: "11px", borderRadius: "4px" }} />
                                    </div>

                                    {/* Animated Skeleton Summary */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem" }}>
                                        <div className={styles.docSkeletonLine} style={{ width: "28%", height: "18px", borderRadius: "4px", marginBottom: "0.35rem" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "100%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "95%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "98%", height: "13px", borderRadius: "4px" }} />
                                    </div>

                                    {/* Animated Skeleton Experience 1 */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                                            <div className={styles.docSkeletonLine} style={{ width: "35%", height: "16px", borderRadius: "4px" }} />
                                            <div className={styles.docSkeletonLine} style={{ width: "22%", height: "14px", borderRadius: "4px" }} />
                                        </div>
                                        <div className={styles.docSkeletonLine} style={{ width: "100%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "92%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "96%", height: "13px", borderRadius: "4px" }} />
                                    </div>

                                    {/* Animated Skeleton Experience 2 */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                                            <div className={styles.docSkeletonLine} style={{ width: "32%", height: "16px", borderRadius: "4px" }} />
                                            <div className={styles.docSkeletonLine} style={{ width: "20%", height: "14px", borderRadius: "4px" }} />
                                        </div>
                                        <div className={styles.docSkeletonLine} style={{ width: "98%", height: "13px", borderRadius: "4px" }} />
                                        <div className={styles.docSkeletonLine} style={{ width: "94%", height: "13px", borderRadius: "4px" }} />
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.documentPaper} style={originalFont ? { fontFamily: `"${originalFont}", Calibri, Inter, sans-serif` } : undefined}>
                                {/* Header */}
                                <div className={styles.docHeader}>
                                    <h1 className={styles.docName}>{displayResume.name}</h1>
                                    <p className={styles.docSubtitle}>{displayResume.headline}</p>
                                    <p className={styles.docSubtitle} style={{ marginTop: "0.25rem", color: "#94A3B8" }}>
                                        {renderWithLinks(displayResume.contact)}
                                    </p>
                                </div>

                                {/* Professional Summary — only if present in original */}
                                {displayResume.summary && displayResume.summary.trim() && (
                                    <div className={styles.docSection}>
                                        <h2 className={styles.docSectionHeader}>{displayResume.summaryTitle || "Professional Summary"}</h2>
                                        <p className={styles.docSummaryText}>{displayResume.summary}</p>
                                    </div>
                                )}

                                {/* Experience */}
                                <div className={styles.docSection}>
                                    {(() => {
                                        let lastSectionHeader = "";
                                        return displayResume.jobs.map((job, jIdx) => {
                                            const sTitle = job.sectionTitle || resolveExperienceTitle(displayResume.experienceTitle, displayResume.headline, displayResume.name);
                                            const showSectionHeader = sTitle && sTitle !== lastSectionHeader;
                                            if (showSectionHeader) lastSectionHeader = sTitle;
                                            return (
                                                <React.Fragment key={job.id}>
                                                    {showSectionHeader && (
                                                        <h2 className={styles.docSectionHeader} style={jIdx > 0 ? { marginTop: "1.5rem" } : undefined}>
                                                            {sTitle}
                                                        </h2>
                                                    )}
                                                    <div className={styles.docJob}>
                                                        <div className={styles.docJobTop}>
                                                            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
                                                                <span className={styles.docJobTitle}>{job.title}</span>
                                                                {job.company && !/^(Professional Experience|Primary Experience|Company)$/i.test(job.company) && (
                                                                    <>
                                                                        <span style={{ margin: "0 0.65rem", color: "#64748B", fontWeight: 400 }}>|</span>
                                                                        <span className={styles.docJobCompany}>{job.company}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {job.date ? <span className={styles.docJobDate} style={{ flexShrink: 0, marginLeft: "1.5rem", whiteSpace: "nowrap" }}>{job.date}</span> : null}
                                                        </div>
                                                        {job.companyDescription && (
                                                            <p
                                                                style={{
                                                                    fontSize: "0.77rem",
                                                                    color: "#64748B",
                                                                    fontStyle: "italic",
                                                                    lineHeight: 1.5,
                                                                    margin: "0 0 0.55rem",
                                                                    background: "#F8FAFC",
                                                                    borderLeft: "2px solid #E2E8F0",
                                                                    padding: "0.35rem 0.6rem",
                                                                    borderRadius: "0 6px 6px 0",
                                                                }}
                                                                title="Company description — not scored"
                                                            >
                                                                {job.companyDescription}
                                                            </p>
                                                        )}
                                                        {job.projectHeaders && job.projectHeaders.length > 0 && !job.bullets.some((b) => b.projectHeader) && (
                                                            <div style={{ margin: "0.4rem 0 0.25rem 0" }}>
                                                                {job.projectHeaders.map((ph, phIdx) => (
                                                                    <div key={phIdx} style={{ fontSize: "0.92rem", fontWeight: 700, color: "#0F172A", padding: "0.15rem 0" }}>
                                                                        {ph}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <ul className={styles.docBulletsList}>
                                                            {(() => {
                                                                let lastPh = "";
                                                                return job.bullets.map((b) => {
                                                                    const showPh = Boolean(b.projectHeader && b.projectHeader !== lastPh);
                                                                    if (showPh && b.projectHeader) lastPh = b.projectHeader;
                                                                    const isProject = isProjectHeader(b.text);
                                                                    if (isProject) {
                                                                        return (
                                                                            <li key={b.id} className={styles.docBulletWrapper} style={{ listStyle: "none" }}>
                                                                                <div style={{ fontSize: "0.92rem", color: "#0F172A", fontWeight: 700, padding: "0.4rem 0 0.15rem 0", margin: "0.3rem 0 0.15rem 0" }}>
                                                                                    {b.text}
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    }
                                                                    const matchingSug = suggestions.find((s) => s.id === b.suggestionId);
                                                                    const isHighlighted = activeSuggestionId && b.suggestionId === activeSuggestionId;
                                                                    const isApplied = matchingSug?.applied;

                                                                    return (
                                                                        <React.Fragment key={b.id}>
                                                                            {showPh && (
                                                                                <li style={{ listStyle: "none", margin: "0.6rem 0 0.25rem 0" }}>
                                                                                    <div style={{ fontSize: "0.96rem", fontWeight: 700, color: "#0F172A", letterSpacing: "0.01em" }}>
                                                                                        {b.projectHeader}
                                                                                    </div>
                                                                                </li>
                                                                            )}
                                                                            <li
                                                                                ref={(el) => {
                                                                                    bulletRefs.current[b.id] = el;
                                                                                }}
                                                                                className={styles.docBulletWrapper}
                                                                            >
                                                                                <div
                                                                                    className={`${styles.docBulletItem} ${isHighlighted ? styles.docBulletHighlighted : ""}`}
                                                                                    onClick={() => {
                                                                                        if (b.suggestionId) {
                                                                                            setActiveSuggestionId(b.suggestionId);
                                                                                        }
                                                                                    }}
                                                                                    title={b.suggestionId ? "Click to view coach suggestion" : undefined}
                                                                                >
                                                                                    <span className={styles.docBulletDot}>•</span>
                                                                                    <span style={{ flex: 1 }}>{b.text}</span>
                                                                                    {matchingSug && !isApplied && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "#2563EB", background: "#DBEAFE", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, flexShrink: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                                                            Suggestion Available
                                                                                        </span>
                                                                                    )}
                                                                                    {!matchingSug && suggestions.length > 0 && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "#475569", background: "#F1F5F9", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, flexShrink: 0, border: "1px solid #E2E8F0", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }} title="Rated 7/10+ — no rewrite needed">
                                                                                            Section is okay
                                                                                        </span>
                                                                                    )}
                                                                                    {isApplied && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "#166534", background: "#DCFCE7", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, flexShrink: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                                                            Edited
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </li>
                                                                        </React.Fragment>
                                                                    );
                                                                });
                                                            })()}
                                                        </ul>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        });
                                    })()}
                                </div>

                                {/* Technical Skills */}
                                <div className={styles.docSection}>
                                    <h2 className={styles.docSectionHeader}>{displayResume.skillsTitle || "Technical Competencies & Skills"}</h2>
                                    <div className={styles.docSkillsWrap}>
                                        {structuredResume.skills.map((sk, idx) => (
                                            <div key={idx} className={styles.docSkillCategory}>
                                                <span className={styles.docSkillLabel}>{sk.category}:</span>
                                                <span className={styles.docSkillItems}>{sk.items}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Education & Certifications */}
                                {displayResume.education && displayResume.education.length > 0 && (
                                    <div className={styles.docSection}>
                                        <h2 className={styles.docSectionHeader}>Education and Certifications</h2>
                                        {displayResume.education.map((edu, eIdx) => (
                                            <div key={eIdx} style={{ marginBottom: "0.85rem" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0F172A" }}>{edu.institution}</span>
                                                    {edu.date && <span style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}>{edu.date}</span>}
                                                </div>
                                                {edu.degree && <div style={{ fontSize: "0.88rem", color: "#334155", marginTop: "0.15rem" }}>{edu.degree}</div>}
                                                {edu.details && <div style={{ fontSize: "0.84rem", color: "#64748B" }}>{edu.details}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Loading Analysis Overlay */}
                {isAnalyzingNewResume && (
                    <div style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.6)",
                        backdropFilter: "blur(4px)",
                        zIndex: 100,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                        <div style={{
                            background: "#FFFFFF",
                            borderRadius: "14px",
                            padding: "2rem",
                            maxWidth: "420px",
                            width: "90%",
                            textAlign: "center",
                            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                        }}>
                            <SpinnerGap size={36} color="#2563EB" style={{ animation: "spin 1s linear infinite", margin: "0 auto 1rem", display: "block" }} />
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#0F172A", margin: "0 0 0.5rem" }}>
                                Analyzing Your Resume
                            </h3>
                            <p style={{ fontSize: "0.82rem", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                                Extracting candidate history with native document parsers and auditing ATS metrics against your target role...
                            </p>
                        </div>
                    </div>
                )}

                {/* Paste / Edit CV Text Modal */}
                {isPasteModalOpen && (
                    <div style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.5)",
                        backdropFilter: "blur(3px)",
                        zIndex: 90,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1rem",
                    }}>
                        <div style={{
                            background: "#FFFFFF",
                            borderRadius: "14px",
                            padding: "1.5rem",
                            maxWidth: "640px",
                            width: "100%",
                            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                                <h3 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0, color: "#0F172A" }}>
                                    Paste or Edit Your Resume Content
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsPasteModalOpen(false)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: "0.2rem" }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <p style={{ fontSize: "0.78rem", color: "#64748B", margin: "0 0 0.85rem", lineHeight: 1.4 }}>
                                Paste your actual resume text (from Word, Google Docs, LinkedIn, or text editor). We will extract your real experience, roles, and bullets and generate in-line Google X-Y-Z suggestions.
                            </p>
                            <textarea
                                value={pastedText}
                                onChange={(e) => setPastedText(e.target.value)}
                                placeholder="Paste your CV text here..."
                                rows={14}
                                style={{
                                    width: "100%",
                                    borderRadius: "8px",
                                    border: "1px solid #CBD5E1",
                                    padding: "0.75rem",
                                    fontSize: "0.82rem",
                                    fontFamily: "monospace",
                                    lineHeight: 1.5,
                                    resize: "vertical",
                                    boxSizing: "border-box",
                                    outline: "none",
                                }}
                            />
                            {analyzeError && (
                                <p style={{ fontSize: "0.78rem", color: "#DC2626", margin: "0.5rem 0 0" }}>
                                    {analyzeError}
                                </p>
                            )}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                                <button
                                    type="button"
                                    className={styles.improverActionSmallBtn}
                                    onClick={() => setIsPasteModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={styles.suggestionApplyBtn}
                                    onClick={handlePasteSubmit}
                                    disabled={!pastedText.trim()}
                                >
                                    <Sparkle size={14} weight="fill" />
                                    Load & Audit Document
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
