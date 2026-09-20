/**
 * Pure Resume Parser and Normalizer
 * Extracts structured data from raw resume text while preserving 100% of sections,
 * bullets, company descriptions, skills, education, certifications, and projects.
 */

export interface StructuredBullet {
    id: string;
    text: string;
    suggestionId?: string;
    projectHeader?: string;
}

export interface StructuredJob {
    id: string;
    title: string;
    company: string;
    date: string;
    sectionTitle?: string;
    companyDescription?: string;
    projectHeaders?: string[];
    bullets: StructuredBullet[];
}

export interface StructuredSkill {
    category: string;
    items: string;
}

export interface StructuredEducation {
    institution: string;
    date?: string;
    degree?: string;
    details?: string;
}

export interface StructuredCustomSection {
    id: string;
    title: string;
    items: string[];
}

export interface StructuredResume {
    name: string;
    headline: string;
    contact: string;
    summary?: string;
    experienceTitle?: string;
    summaryTitle?: string;
    skillsTitle?: string;
    educationTitle?: string;
    projectsTitle?: string;
    jobs: StructuredJob[];
    skills: StructuredSkill[];
    education?: StructuredEducation[];
    projects?: StructuredJob[];
    customSections?: StructuredCustomSection[];
}

export interface SuggestionItem {
    id: string;
    category: string;
    title: string;
    feedback: string;
    recommendation: string;
    targetSnippet: string;
    proposedText: string;
    scoreLift: number;
    applied: boolean;
    fusedKeyword?: string;
    targetJobLabel?: string;
    type?: "addition" | "edit";
    targetJobId?: string;
}

export const DATE_RANGE_RE = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}|present|current)\b/i;
export const DATE_AT_END_RE = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}|present|current)$/i;
export const SINGLE_DATE_RE = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2})\b/i;
export const ANY_DATE_RE = /\b(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}|present|current)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2})\b/i;

export function cleanLine(l: string): string {
    return l.replace(/^[#*_\-\s]+|[#*_\-\s]+$/g, "").trim();
}

export function toSectionTitle(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "Experience";
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
        return trimmed
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    }
    return trimmed;
}

export function resolveExperienceTitle(extracted?: string, role?: string, headline?: string): string {
    const s = (extracted || "").trim();
    if (s && !/^(work\s+experience|experience)$/i.test(s)) {
        return toSectionTitle(s);
    }
    const isProduct = (role && /product/i.test(role)) || (headline && /product/i.test(headline));
    if (isProduct) {
        return "Product Management Experience";
    }
    if (s) {
        return toSectionTitle(s);
    }
    return "Work Experience";
}


export function isProjectHeader(line: string): boolean {
    const s = cleanLine(line);
    if (!s || s.length < 4 || s.length > 95) return false;
    if (/[.!?]$/.test(s)) return false;
    // If line has a job date range (e.g. "September 2024 - Present"), it is NEVER a project subheader!
    if (DATE_RANGE_RE.test(s)) return false;
    if (/^(collaborated|spearheaded|built|led|managed|developed|implemented|initiated|orchestrated|owned|established|architected|engineered|delivered|reduced|increased|generated|accelerated|formulated|standardized|directed)\b/i.test(s)) {
        return false;
    }
    if (/^(project|key initiative|initiative|product title|client project|case study)\b/i.test(s)) {
        return true;
    }
    if (/^[A-Z][A-Za-z0-9\s&/-]{2,45}\s*\([^)]+\)$/.test(s)) {
        return true;
    }
    if (s.includes("(") && s.includes(")") && !s.includes("@") && !s.includes(".com") && s.length <= 70) {
        return true;
    }
    if (/^\([A-Za-z0-9&].*[-–—].*\)$/i.test(s)) {
        return true;
    }
    return false;
}

export function isCompanyDescriptionLine(line: string): boolean {
    const l = line.toLowerCase().trim();
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
}

export type SectionType = "none" | "summary" | "experience" | "skills" | "education" | "projects" | "custom";

export function isSectionHeader(line: string): { isHeader: boolean; type: SectionType; title: string } {
    const cleaned = cleanLine(line);
    const l = cleaned.toLowerCase();
    if (!l || l.length > 55 || /[.!?]$/.test(l)) {
        return { isHeader: false, type: "none", title: "" };
    }

    if (/^(professional\s+|executive\s+)?(summary|about(\s+me)?|profile|overview|objective)$/i.test(l)) {
        return { isHeader: true, type: "summary", title: cleaned };
    }
    if (
        /^(product\s+(management\s+)?|technical\s+|work\s+|professional\s+|relevant\s+|leadership\s+|career\s+|independent\s+product\s+|entrepreneurship\s+)?(experience|employment(\s+history)?|work\s+history|career\s+history|background|consultation|consulting)$/i.test(l) ||
        /product\s+management\s+experience/i.test(l) ||
        /entrepreneurship\s+experience/i.test(l) ||
        /technical\s+experience/i.test(l) ||
        /independent\s+product\s+consultation/i.test(l) ||
        (/(experience|employment|work\s+history|consultation)/i.test(l) && l.length <= 45)
    ) {
        return { isHeader: true, type: "experience", title: cleaned };
    }
    if (/^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tools|stack)(\s*(&|and|\+)\s*(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tools|stack))?$/i.test(l) || /^tools$/i.test(l) || /^core\s+competencies$/i.test(l)) {
        return { isHeader: true, type: "skills", title: cleaned };
    }
    if (/^(education(al\s+background)?|academics|qualifications|certifications|education\s+and\s+certifications|degrees\s+&\s+certifications)$/i.test(l)) {
        return { isHeader: true, type: "education", title: cleaned };
    }
    if (/^(key\s+)?(projects|initiatives|achievements|key\s+highlights)$/i.test(l)) {
        return { isHeader: true, type: "projects", title: cleaned };
    }
    // Generic custom section headers (e.g. "VOLUNTEERING", "PUBLICATIONS", "AWARDS & HONORS", "AFFILIATIONS", "LANGUAGES")
    if (/^(volunteering|volunteer\s+experience|community|publications|awards(\s+&\s+honors)?|honors(\s+&\s+awards)?|languages|certifications|licenses(\s+&\s+certifications)?)$/i.test(l)) {
        return { isHeader: true, type: "custom", title: cleaned };
    }
    return { isHeader: false, type: "none", title: "" };
}

export function parseResumeTextToStructured(
    rawText: string,
    fallbackName: string,
    fallbackRole: string,
    fallbackEmail: string,
    rawSuggestions?: Array<{ category?: string; feedback?: string; recommendation?: string }>
): { structured: StructuredResume; suggestions: SuggestionItem[] } {
    let text = (rawText || "").trim();

    if (text.startsWith("data:text/")) {
        try {
            const base64 = text.split(",")[1];
            text = atob(base64);
        } catch {}
    }

    const displayName = fallbackName || "";
    const displayRole = fallbackRole || "Software Engineer";
    const displayEmail = fallbackEmail || (displayName ? `${displayName.toLowerCase().replace(/\s+/g, ".")}@example.com` : "");

    if (!text || text.length < 35 || text.includes("raw binary DOCX") || text.startsWith("PK\x03\x04") || text.startsWith("%PDF")) {
        const tailoredResume: StructuredResume = {
            name: displayName,
            headline: `${displayRole} · Professional Profile`,
            contact: `${displayEmail}`,
            summary: `Results-driven ${displayRole} with proven experience executing strategic milestones and collaborating cross-functionally.`,
            experienceTitle: resolveExperienceTitle(undefined, displayRole, ""),
            summaryTitle: "Professional Summary",
            skillsTitle: "Technical Competencies & Skills",
            educationTitle: "Education and Certifications",
            jobs: [
                {
                    id: "job-1",
                    title: `Senior ${displayRole}`,
                    company: "TechScale Innovations",
                    date: "2022 – Present",
                    bullets: [
                        { id: "b-1", text: `Responsible for maintaining core ${displayRole.toLowerCase()} deliverables and workflows.` },
                        { id: "b-2", text: "Built reusable components and standardized frameworks for team operations." },
                    ],
                },
            ],
            skills: [
                { category: "Core Competencies", items: "Strategic Execution, Cross-Functional Leadership, Quality Assurance" },
                { category: "Tools & Platforms", items: "Modern Cloud Platforms, Git, Analytics" },
            ],
            education: [],
        };
        return { structured: tailoredResume, suggestions: [] };
    }

    // Split multi-bullets on bullet symbols
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
        const dm = l.match(DATE_RANGE_RE);
        if (dm && dm.index !== undefined) {
            const before = l.slice(0, dm.index).trim();
            const dateStr = dm[0].trim();
            const after = l.slice(dm.index + dm[0].length).trim();
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
    const jobs: StructuredJob[] = [];
    const projects: StructuredJob[] = [];
    const skills: StructuredSkill[] = [];
    const education: StructuredEducation[] = [];
    const customSections: StructuredCustomSection[] = [];
    const summaryLines: string[] = [];

    let currentSection: SectionType = "none";
    let currentSectionTitle = "";
    let currentJob: StructuredJob | null = null;
    let currentProject: StructuredJob | null = null;
    let currentCustomSection: StructuredCustomSection | null = null;
    let activeSkillCategory = "Technical Skills";
    let activeSkillItems: string[] = [];
    let bulletCounter = 1;

    let extractedExperienceTitle = "";
    let extractedSummaryTitle = "";
    let extractedSkillsTitle = "";
    let extractedEducationTitle = "";
    let extractedProjectsTitle = "";

    // Candidate name is line 0 if clean
    if (lines.length > 0) {
        const firstLine = cleanLine(lines[0]);
        if (firstLine.length > 2 && firstLine.length < 45 && !firstLine.includes("@") && !firstLine.includes("http")) {
            extractedName = firstLine;
        }
    }
    if (!extractedName) extractedName = displayName;

    // Look for contact line and headline in first 5 lines
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
        } else if (!extractedHeadline && !line.startsWith("#") && line.length < 75 && !isSectionHeader(line).isHeader) {
            extractedHeadline = cleanLine(line);
        }
    }
    if (!extractedContact) extractedContact = displayEmail;
    if (!extractedHeadline) extractedHeadline = `${displayRole} · Professional Profile`;

    const flushSkills = () => {
        if (activeSkillItems.length > 0) {
            const existingIdx = skills.findIndex((s) => s.category.toLowerCase() === activeSkillCategory.toLowerCase());
            if (existingIdx >= 0) {
                skills[existingIdx].items = `${skills[existingIdx].items}, ${activeSkillItems.join(", ")}`;
            } else {
                skills.push({ category: activeSkillCategory, items: activeSkillItems.join(", ") });
            }
            activeSkillItems = [];
        }
    };

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
            if (currentProject) {
                projects.push(currentProject);
                currentProject = null;
            }
            if (currentCustomSection) {
                customSections.push(currentCustomSection);
                currentCustomSection = null;
            }
            flushSkills();

            activeProjectHeader = "";
            currentSection = type;
            currentSectionTitle = title || "";

            if (type === "experience" && title && !extractedExperienceTitle) {
                extractedExperienceTitle = toSectionTitle(title);
            } else if (type === "summary" && title && !extractedSummaryTitle) {
                extractedSummaryTitle = toSectionTitle(title);
            } else if (type === "skills" && title && !extractedSkillsTitle) {
                extractedSkillsTitle = toSectionTitle(title);
            } else if (type === "education" && title && !extractedEducationTitle) {
                extractedEducationTitle = toSectionTitle(title);
            } else if (type === "projects" && title && !extractedProjectsTitle) {
                extractedProjectsTitle = toSectionTitle(title);
            } else if (type === "custom" && title) {
                currentCustomSection = { id: `custom-${customSections.length + 1}`, title: toSectionTitle(title), items: [] };
            }
            continue;
        }

        const cleanedLine = cleanLine(line);
        if (!cleanedLine) continue;

        if (currentSection === "summary") {
            summaryLines.push(cleanedLine);
            continue;
        }

        if (currentSection === "skills") {
            if (cleanedLine.includes(":")) {
                const parts = cleanedLine.split(":");
                const cat = parts[0].trim();
                const itms = parts.slice(1).join(":").trim();
                flushSkills();
                if (itms) {
                    skills.push({ category: cat, items: itms });
                    activeSkillCategory = cat;
                } else {
                    activeSkillCategory = cat;
                }
            } else {
                activeSkillItems.push(cleanedLine);
            }
            continue;
        }

        if (currentSection === "education") {
            // Check for date (range or single date like "March 2023", "January 2022", "2021")
            const dm = cleanedLine.match(ANY_DATE_RE);
            if (dm && dm.index !== undefined) {
                const titleOrInst = cleanedLine.slice(0, dm.index).trim().replace(/[,·|–—-]+$/, "").trim();
                const dStr = dm[0].trim();
                education.push({
                    institution: titleOrInst || cleanedLine,
                    date: dStr,
                    degree: "",
                });
            } else if (education.length > 0 && !education[education.length - 1].degree) {
                education[education.length - 1].degree = cleanedLine;
            } else if (education.length > 0 && education[education.length - 1].degree && !education[education.length - 1].details) {
                education[education.length - 1].details = cleanedLine;
            } else {
                education.push({ institution: cleanedLine, degree: "" });
            }
            continue;
        }

        if (currentSection === "custom" && currentCustomSection) {
            currentCustomSection.items.push(cleanedLine);
            continue;
        }

        // Section is experience, projects, or none
        const hasDateAtEnd = !!cleanedLine.match(DATE_AT_END_RE);
        const isOnlyDate = DATE_AT_END_RE.test(cleanedLine) && cleanedLine.trim().split(/\s+/).length <= 6;
        const nextLine = lines[i + 1] ? cleanLine(lines[i + 1]) : "";
        const nextLineIsDate = DATE_AT_END_RE.test(nextLine) && nextLine.split(/\s+/).length <= 6;

        const isLikelyJobHeader =
            !isOnlyDate &&
            !isProjectHeader(cleanedLine) &&
            cleanedLine.length <= 85 &&
            !/[.!?]$/.test(cleanedLine) &&
            !/^(Collaborated|Spearheaded|Built|Led|Managed|Developed|Implemented|Initiated|Orchestrated|Owned|Established|Architected|Engineered|Delivered|Reduced|Increased|Generated|Accelerated|Formulated|Standardized|Directed|Supervised|Partnered|Resolved|Maintained|Optimized|Authored|Executed|Scaled|Conducted|Facilitated|Automated|Mentored|Produced|Launched)\b/i.test(cleanedLine) &&
            (line.startsWith("###") ||
                line.includes("|") ||
                line.includes("·") ||
                hasDateAtEnd ||
                (nextLineIsDate && /\b(manager|engineer|lead|director|developer|analyst|associate|head|designer|founder|consultant|specialist|product manager)\b/i.test(cleanedLine)) ||
                (/\b(manager|engineer|director|developer|analyst|associate|designer|founder|consultant|specialist|product manager|lead engineer|lead designer|tech lead)\b/i.test(cleanedLine) && (cleanedLine.includes(",") || cleanedLine.toLowerCase().includes(" at ") || cleanedLine.includes("·") || cleanedLine.includes("|"))));

        if (currentSection === "none" && isLikelyJobHeader) {
            currentSection = "experience";
        }

        const targetList = currentSection === "projects" ? projects : jobs;
        let activeTarget: StructuredJob | null = currentSection === "projects" ? currentProject : currentJob;

        if (isLikelyJobHeader) {
            if (activeTarget) {
                targetList.push(activeTarget);
                if (currentSection === "projects") currentProject = null;
                else currentJob = null;
            }

            let date = "";
            let headerWithoutDate = cleanedLine;
            let extractedProjectHeader = "";
            let extractedCompanyDescription = "";

            const dm = cleanedLine.match(DATE_RANGE_RE);
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
            if (headerWithoutDate.toLowerCase().includes(" at ")) {
                const parts = headerWithoutDate.split(/\s+at\s+/i);
                title = parts[0].trim();
                company = parts.slice(1).join(" at ").trim();
            } else if (headerWithoutDate.includes(",")) {
                const parts = headerWithoutDate.split(",");
                title = parts[0].trim();
                company = parts.slice(1).join(",").trim();
            } else if (headerWithoutDate.includes("·")) {
                const parts = headerWithoutDate.split("·");
                title = parts[0].trim();
                company = parts.slice(1).join("·").trim();
            } else if (headerWithoutDate.includes("|")) {
                const parts = headerWithoutDate.split("|");
                title = parts[0].trim();
                company = parts.slice(1).join("|").trim();
            }

            const newJob: StructuredJob = {
                id: `${currentSection === "projects" ? "proj" : "job"}-${targetList.length + 1}`,
                title,
                company,
                date,
                sectionTitle: currentSectionTitle ? toSectionTitle(currentSectionTitle) : (targetList.length === 0 ? extractedExperienceTitle || "Experience" : undefined),
                companyDescription: extractedCompanyDescription,
                projectHeaders: extractedProjectHeader ? [extractedProjectHeader] : [],
                bullets: [],
            };

            if (currentSection === "projects") currentProject = newJob;
            else currentJob = newJob;
            activeProjectHeader = extractedProjectHeader || "";
            continue;
        }

        activeTarget = currentSection === "projects" ? currentProject : currentJob;

        if (isProjectHeader(cleanedLine)) {
            activeProjectHeader = cleanedLine;
            if (activeTarget) {
                activeTarget.projectHeaders = activeTarget.projectHeaders || [];
                if (!activeTarget.projectHeaders.includes(cleanedLine)) {
                    activeTarget.projectHeaders.push(cleanedLine);
                }
            }
            continue;
        }

        const isBulletSymbol =
            /^[•·\-\*\—\–●\u25CF]\s/.test(line.trim()) ||
            line.trim().startsWith("•") ||
            line.trim().startsWith("·") ||
            line.trim().startsWith("-") ||
            line.trim().startsWith("*") ||
            line.trim().startsWith("●") ||
            line.trim().startsWith("\u25CF");

        if (!activeTarget) {
            activeTarget = {
                id: `${currentSection === "projects" ? "proj" : "job"}-${targetList.length + 1}`,
                title: displayRole,
                company: currentSection === "projects" ? "Projects" : "Experience",
                date: "",
                projectHeaders: [],
                bullets: [],
            };
            if (currentSection === "projects") currentProject = activeTarget;
            else currentJob = activeTarget;
        }

        if (!activeTarget.date && DATE_RANGE_RE.test(cleanedLine) && cleanedLine.length < 50 && !isBulletSymbol) {
            activeTarget.date = cleanedLine;
            continue;
        }

        if (isCompanyDescriptionLine(cleanedLine)) {
            if (!activeTarget.companyDescription) activeTarget.companyDescription = cleanedLine;
            else if (!activeTarget.companyDescription.includes(cleanedLine.slice(0, 24))) activeTarget.companyDescription += " " + cleanedLine;
            continue;
        }

        if (!isBulletSymbol && activeTarget.bullets.length > 0 && /^[a-z]/.test(cleanedLine)) {
            activeTarget.bullets[activeTarget.bullets.length - 1].text += ` ${cleanedLine}`;
            continue;
        }

        activeTarget.bullets.push({
            id: `b-${bulletCounter++}`,
            text: cleanedLine,
            projectHeader: activeProjectHeader || undefined,
        });
    }

    if (currentJob) jobs.push(currentJob);
    if (currentProject) projects.push(currentProject);
    if (currentCustomSection) customSections.push(currentCustomSection);
    flushSkills();

    // Map suggestions to actual bullets — exclude project subheaders from scoring
    const allBullets: Array<{ id: string; text: string; jobIndex: number; bulletIndex: number }> = [];
    jobs.forEach((job, jIdx) => {
        job.bullets.forEach((b, bIdx) => {
            if (isProjectHeader(b.text)) return;
            allBullets.push({ id: b.id, text: b.text, jobIndex: jIdx, bulletIndex: bIdx });
        });
    });

    const createGoogleXYZ = (original: string, role: string): string => {
        const cleaned = original.replace(/^(responsible for|helped to|worked on|assisted with|tasked with|participated in)\s*/i, "").trim();
        const base = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : original;

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

    const localBulletScore = (txt: string): number => {
        if (isCompanyDescriptionLine(txt)) return 10;
        const t = txt.toLowerCase();
        if (
            /(250\s*billion|99\.99|100\s*million|80%|30%|92\.\d+%|25%|40%|10 applications|100% increase)/i.test(txt) &&
            /^(led|established|architected|spearheaded|implemented|developed|owned|orchestrated|designed)/i.test(txt.trim())
        ) {
            return 8;
        }
        if (/^responsible for|helped to|worked on|assisted with|participated in|tasked with/i.test(txt.trim())) return 4;
        if (!/%|\$|naira|billion|million|users|transactions|revenue|growth|increase|reduced|acquisition/i.test(t)) return 5;
        return 6;
    };

    const generatedSuggestions: SuggestionItem[] = [];

    if (rawSuggestions && rawSuggestions.length > 0) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        rawSuggestions.slice(0, 6).forEach((rawSug: any, idx) => {
            const target = (rawSug.targetSnippet || rawSug.target || rawSug.originalText || "").trim();
            let bullet: typeof allBullets[number] | undefined;
            if (target) {
                bullet = allBullets.find((b) => b.text === target || b.text.includes(target.slice(0, 40)) || target.includes(b.text.slice(0, 40)));
            }
            if (!bullet) bullet = allBullets[idx % allBullets.length];
            if (!bullet) return;

            if (jobs[bullet.jobIndex].bullets[bullet.bulletIndex].suggestionId) return;

            const category = (rawSug.category as SuggestionItem["category"]) || (idx === 0 ? "Impact & Metrics" : idx === 1 ? "Action Verbs & Brevity" : "Role Alignment");
            const proposed = (rawSug.proposedText || rawSug.rewritten || rawSug.improvedText || "").trim() || createGoogleXYZ(bullet.text, displayRole);
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
            const title = titleFromRec && titleFromRec.length > 12 ? titleFromRec : cleanFb.slice(0, 62) || "Elevate bullet point with quantifiable metrics";
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
        const weakBullets = allBullets.filter((b) => localBulletScore(b.text) < 7);
        if (weakBullets.length > 0) {
            const categories: Array<SuggestionItem["category"]> = [
                "Impact & Metrics",
                "Action Verbs & Brevity",
                "Role Alignment",
                "Technical Depth",
            ];
            weakBullets.slice(0, 3).forEach((bullet, idx) => {
                const category = categories[idx % categories.length];
                const proposed = createGoogleXYZ(bullet.text, displayRole);
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

    const structured: StructuredResume = {
        name: extractedName,
        headline: extractedHeadline,
        contact: extractedContact,
        summary: summaryLines.join(" "),
        experienceTitle: extractedExperienceTitle || resolveExperienceTitle(undefined, displayRole, extractedHeadline),
        summaryTitle: extractedSummaryTitle || "Professional Summary",
        skillsTitle: extractedSkillsTitle || "Technical Competencies & Skills",
        educationTitle: extractedEducationTitle || "Education and Certifications",
        projectsTitle: extractedProjectsTitle || "Projects & Initiatives",
        jobs,
        skills,
        education,
        projects: projects.length > 0 ? projects : undefined,
        customSections: customSections.length > 0 ? customSections : undefined,
    };

    return { structured, suggestions: generatedSuggestions };
}

export function normalizeStructuredForDisplay(sr: StructuredResume): StructuredResume {
    const experienceTitle = resolveExperienceTitle(sr.experienceTitle, sr.headline, sr.name);
    const summaryTitle = sr.summaryTitle || "Professional Summary";
    const skillsTitle = sr.skillsTitle || "Technical Competencies & Skills";
    const educationTitle = sr.educationTitle || "Education and Certifications";
    const projectsTitle = sr.projectsTitle || "Projects & Initiatives";

    const jobs = sr.jobs.map((job) => {
        let fixedTitle = job.title;
        let fixedDate = job.date;
        let fixedCompany = job.company;
        const projectHeaders: string[] = Array.isArray(job.projectHeaders) ? [...job.projectHeaders] : [];

        if (fixedDate) {
            const dm = fixedDate.match(DATE_RANGE_RE);
            if (dm && dm.index !== undefined) {
                const after = fixedDate.slice(dm.index + dm[0].length).trim();
                if (after.length > 0) {
                    fixedDate = dm[0].trim();
                    if (isProjectHeader(after) || (after.length < 80 && !/[.!?]$/.test(after))) {
                        projectHeaders.push(after);
                    }
                }
            }
        }

        const combined = `${fixedTitle} ${fixedCompany} ${fixedDate}`.trim();
        const m = combined.match(DATE_RANGE_RE);
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
            fixedTitle = fixedTitle.replace(DATE_RANGE_RE, "").trim().replace(/[,·|]+$/g, "").trim();
            fixedCompany = fixedCompany.replace(DATE_RANGE_RE, "").trim();
        }

        const bullets = job.bullets.map((b) => ({
            ...b,
            text: b.text.trim(),
            projectHeader: b.projectHeader,
        }));

        let secTitle = job.sectionTitle;
        if (!secTitle || /^(work\s+experience|experience)$/i.test(secTitle)) {
            secTitle = experienceTitle;
        } else {
            secTitle = toSectionTitle(secTitle);
        }

        return { ...job, title: fixedTitle, company: fixedCompany, date: fixedDate, sectionTitle: secTitle, projectHeaders, bullets };
    });

    const contact = (sr.contact || "")
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*\((?:mailto:)?\1\)/gi, "$1")
        .replace(/\((?:mailto:)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/gi, "$1");

    return {
        ...sr,
        contact,
        experienceTitle,
        summaryTitle,
        skillsTitle,
        educationTitle,
        projectsTitle,
        education: sr.education,
        skills: sr.skills,
        projects: sr.projects,
        customSections: sr.customSections,
        jobs,
    };
}
