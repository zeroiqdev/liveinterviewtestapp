"use client";

import React, { useState, useEffect } from "react";
import {
    Sparkle,
    ArrowsClockwise,
    Copy,
    Check,
    PencilSimple,
    Eye,
    ShieldCheck,
    WarningCircle,
    CaretDown,
    CaretUp,
    FloppyDisk,
    CheckCircle,
} from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import type { CareerNarrativeResult, ResumeSectionEdit } from "@/app/api/resume/narrative/route";

interface CareerNarrativeStudioProps {
    currentRole: string;
    targetRole: string;
    resumeText: string;
    resumeName?: string;
    userEmail?: string;
    onApplyToProfile?: (updatedSummary: string) => void;
}

interface TemplatePreset {
    id: string;
    title: string;
    category: string;
    badge: string;
    description: string;
}

const NARRATIVE_TEMPLATES: TemplatePreset[] = [
    {
        id: "technical_pm",
        title: "Technical Product Manager",
        category: "Product Management",
        badge: "Systems & Architecture",
        description: "Emphasizes API design, distributed systems trade-offs, developer empathy, and deep technical feasibility.",
    },
    {
        id: "core_pm",
        title: "Core / Growth Product Manager",
        category: "Product Management",
        badge: "Discovery & Metrics",
        description: "Emphasizes customer problem discovery, A/B testing hypotheses, user retention, GTM launches, and business ROI.",
    },
    {
        id: "sre",
        title: "DevOps / Site Reliability Engineer",
        category: "Engineering & Infrastructure",
        badge: "Scale & Reliability",
        description: "Positions experience around uptime SLOs, Kubernetes orchestration, CI/CD automation, cost governance, and fault tolerance.",
    },
    {
        id: "product_engineer",
        title: "Product / Full-Stack Engineer",
        category: "Engineering & Infrastructure",
        badge: "Velocity & UX Polish",
        description: "Highlights rapid feature iteration, responsive design fidelity, clean frontend architecture, and direct customer impact.",
    },
    {
        id: "lead_architect",
        title: "Lead / Staff Systems Architect",
        category: "Engineering Leadership",
        badge: "Enterprise Strategy",
        description: "Frames projects around multi-team consensus, technical RFC authoring, long-term decoupling, and architectural standards.",
    },
    {
        id: "data_analytics",
        title: "Data & Analytics Lead",
        category: "Data & AI",
        badge: "Business Intelligence",
        description: "Focuses on cohort retention modeling, executive KPI pipelines, metric instrumentation, and automated attribution.",
    },
];

export function CareerNarrativeStudio({
    currentRole,
    targetRole,
    resumeText,
    resumeName,
    userEmail,
    onApplyToProfile,
}: CareerNarrativeStudioProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<string>("technical_pm");
    const [loading, setLoading] = useState<boolean>(false);
    const [narrativeData, setNarrativeData] = useState<CareerNarrativeResult | null>(null);
    const [sections, setSections] = useState<ResumeSectionEdit[]>([]);
    const [expandedSection, setExpandedSection] = useState<string>("summary");
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch narrative whenever template changes or user triggers generation
    const fetchNarrative = async (templateId: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/resume/narrative", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resumeText,
                    currentRole,
                    targetRole: targetRole || currentRole,
                    templateId,
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to generate narrative");
            }

            if (data.narrative) {
                setNarrativeData(data.narrative);
                setSections(data.narrative.sections || []);
            }
        } catch (err) {
            console.error("Narrative generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to load narrative");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNarrative(selectedTemplate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTemplate]);

    const handleSectionContentChange = (index: number, newContent: string) => {
        setSections((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], tailoredContent: newContent };
            return next;
        });
    };

    const handleCopySection = (index: number, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleCopyAll = () => {
        const fullDoc = sections
            .map((s) => `### ${s.sectionTitle}\n${s.tailoredContent}`)
            .join("\n\n");
        navigator.clipboard.writeText(fullDoc);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
    };

    const handleSaveToProfile = () => {
        const summarySec = sections.find((s) => s.sectionId === "summary");
        if (summarySec && onApplyToProfile) {
            onApplyToProfile(summarySec.tailoredContent);
        }

        // Save customized resume narrative to localStorage
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                parsed.tailoredNarrative = {
                    templateId: selectedTemplate,
                    sections,
                    updatedAt: new Date().toISOString(),
                };
                localStorage.setItem("useladder_user", JSON.stringify(parsed));
            } catch (e) {
                console.error("Failed to save narrative locally:", e);
            }
        }

        // Sync to MongoDB if email available
        if (userEmail) {
            fetch("/api/auth/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: userEmail,
                    tailoredNarrative: {
                        templateId: selectedTemplate,
                        sections,
                    },
                }),
            }).catch((e) => console.warn("Failed syncing narrative to user doc:", e));
        }

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
    };

    return (
        <div className={styles.narrativeStudioContainer}>
            {/* ── Studio Header & Subtitle ── */}
            <div className={styles.narrativeHeaderBanner}>
                <div className={styles.narrativeTitleRow}>
                    <div className={styles.narrativeIconBadge}>
                        <Sparkle size={18} weight="fill" color="#2563EB" />
                    </div>
                    <div>
                        <h3 className={styles.narrativeMainTitle}>Career Narrative & Recruiter Perception Studio</h3>
                        <p className={styles.narrativeSubtitle}>
                            See how recruiters view your career trajectory, and reframe your resume section-by-section to fit target roles.
                        </p>
                    </div>
                </div>

                <div className={styles.narrativeActiveCvChip}>
                    <Eye size={14} weight="bold" color="#64748B" />
                    <span>Analyzed from: <strong>{resumeName || "Active Resume"}</strong></span>
                </div>
            </div>

            {/* ── Template Presets Switcher ── */}
            <div className={styles.narrativeTemplatesWrapper}>
                <div className={styles.narrativeSectionHeadingRow}>
                    <span className={styles.narrativeSectionHeading}>Choose Positioning Template</span>
                    <span className={styles.narrativeSectionHeadingSub}>Select the strategic narrative angle for your target role</span>
                </div>

                <div className={styles.narrativeTemplatesGrid}>
                    {NARRATIVE_TEMPLATES.map((t) => {
                        const isSelected = selectedTemplate === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={`${styles.templateCard} ${isSelected ? styles.templateCardActive : ""}`}
                                onClick={() => setSelectedTemplate(t.id)}
                            >
                                <div className={styles.templateCardTop}>
                                    <span className={styles.templateCategory}>{t.category}</span>
                                    <span className={styles.templateBadge}>{t.badge}</span>
                                </div>
                                <h4 className={styles.templateTitle}>{t.title}</h4>
                                <p className={styles.templateDesc}>{t.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading && (
                <div className={styles.narrativeLoadingState}>
                    <ArrowsClockwise size={28} className="animate-spin" color="#2563EB" />
                    <p className={styles.narrativeLoadingText}>
                        Simulating recruiter eye-tracking & crafting section-by-section career narrative...
                    </p>
                </div>
            )}

            {error && (
                <div className={styles.errorBanner} style={{ margin: "1rem 0" }}>
                    <WarningCircle size={16} weight="bold" />
                    {error}
                </div>
            )}

            {!loading && narrativeData && (
                <div className={styles.narrativeContentBody}>
                    {/* ── 1. How Recruiters View Your Career Card ── */}
                    <div className={styles.recruiterLensCard}>
                        <div className={styles.recruiterLensHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <ShieldCheck size={20} weight="fill" color="#2563EB" />
                                <h4 className={styles.recruiterLensTitle}>How Recruiters Currently View Your Career</h4>
                            </div>
                            <span className={styles.seniorityBadge}>
                                Perceived Level: {narrativeData.recruiterPerception.perceivedSeniority}
                            </span>
                        </div>

                        <p className={styles.recruiterPerceptionSummary}>
                            {narrativeData.recruiterPerception.perceptionSummary}
                        </p>

                        <div className={styles.recruiterPointsGrid}>
                            <div className={styles.recruiterStrengthsCol}>
                                <div className={styles.pointsColHeader} style={{ color: "#16A34A" }}>
                                    <Check size={14} weight="bold" />
                                    Strengths Seen Immediately:
                                </div>
                                <ul className={styles.pointsList}>
                                    {narrativeData.recruiterPerception.strengthsSeenByRecruiter.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className={styles.recruiterHesitationsCol}>
                                <div className={styles.pointsColHeader} style={{ color: "#EA580C" }}>
                                    <WarningCircle size={14} weight="bold" />
                                    Potential Hesitations / Gaps:
                                </div>
                                <ul className={styles.pointsList}>
                                    {narrativeData.recruiterPerception.potentialHesitations.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {narrativeData.strategicReframingAngle && (
                            <div className={styles.strategicPivotBanner}>
                                <span className={styles.pivotLabel}>Strategic Pivot for {narrativeData.templateTitle}:</span>
                                <span className={styles.pivotText}>{narrativeData.strategicReframingAngle}</span>
                            </div>
                        )}
                    </div>

                    {/* ── 2. Section-by-Section Reframing Accordion ── */}
                    <div className={styles.sectionsAccordionWrap}>
                        <div className={styles.narrativeSectionHeadingRow}>
                            <div>
                                <span className={styles.narrativeSectionHeading}>Section-by-Section Resume Tailoring</span>
                                <span className={styles.narrativeSectionHeadingSub}>
                                    Edit each section directly to fit the {narrativeData.templateTitle} narrative
                                </span>
                            </div>

                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                    type="button"
                                    className={styles.copyAllNarrativeBtn}
                                    onClick={handleCopyAll}
                                >
                                    <Copy size={14} weight="bold" />
                                    Copy Entire CV
                                </button>
                                <button
                                    type="button"
                                    className={styles.saveNarrativeBtn}
                                    onClick={handleSaveToProfile}
                                >
                                    <FloppyDisk size={14} weight="bold" />
                                    Save Narrative
                                </button>
                            </div>
                        </div>

                        {saveSuccess && (
                            <div className={styles.narrativeSaveSuccessAlert}>
                                <CheckCircle size={16} weight="fill" color="#16A34A" />
                                Narrative saved and updated in active profile!
                            </div>
                        )}

                        <div className={styles.sectionsAccordionList}>
                            {sections.map((sec, idx) => {
                                const isExpanded = expandedSection === sec.sectionId;
                                return (
                                    <div key={sec.sectionId} className={styles.sectionAccordionItem}>
                                        <div
                                            className={styles.sectionAccordionHeader}
                                            onClick={() => setExpandedSection(isExpanded ? "" : sec.sectionId)}
                                        >
                                            <div className={styles.sectionHeaderLeft}>
                                                <span className={styles.sectionIndexBadge}>{idx + 1}</span>
                                                <span className={styles.sectionItemTitle}>{sec.sectionTitle}</span>
                                                <span className={styles.sectionRewrittenTag}>Tailored Rewrite</span>
                                            </div>
                                            <div className={styles.sectionHeaderRight}>
                                                {isExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className={styles.sectionAccordionBody}>
                                                {/* Recruiter Rationale Callout */}
                                                <div className={styles.recruiterRationaleNotice}>
                                                    <strong>Recruiter Rationale:</strong> {sec.recruiterRationale}
                                                </div>

                                                <div className={styles.sectionEditorRow}>
                                                    {/* Original Baseline Column */}
                                                    <div className={styles.originalCol}>
                                                        <span className={styles.colLabel}>Original CV Baseline</span>
                                                        <div className={styles.originalContentBox}>
                                                            {sec.originalContent || "No explicit content extracted from resume for this section."}
                                                        </div>
                                                    </div>

                                                    {/* Tailored Rewrite (Editable) Column */}
                                                    <div className={styles.tailoredCol}>
                                                        <div className={styles.tailoredColTop}>
                                                            <span className={styles.colLabel} style={{ color: "#2563EB" }}>
                                                                Tailored Narrative (Editable)
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className={styles.copySectionBtn}
                                                                onClick={() => handleCopySection(idx, sec.tailoredContent)}
                                                            >
                                                                {copiedIndex === idx ? (
                                                                    <>
                                                                        <Check size={12} weight="bold" color="#16A34A" />
                                                                        Copied
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy size={12} weight="bold" />
                                                                        Copy
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            className={styles.tailoredTextarea}
                                                            rows={sec.sectionId === "headline" ? 2 : sec.sectionId === "skills" ? 3 : 5}
                                                            value={sec.tailoredContent}
                                                            onChange={(e) => handleSectionContentChange(idx, e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                {sec.suggestions && sec.suggestions.length > 0 && (
                                                    <div className={styles.sectionSuggestionsRow}>
                                                        <span className={styles.suggestionTagLabel}>Coach Advice:</span>
                                                        {sec.suggestions.map((tip, sIdx) => (
                                                            <span key={sIdx} className={styles.suggestionItemChip}>
                                                                • {tip}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
