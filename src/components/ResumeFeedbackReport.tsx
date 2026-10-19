"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./feedback.module.css";
import { FeedbackButton } from "./FeedbackButton";
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
    UploadSimple,
} from "@phosphor-icons/react";
import type { ResumeScanFeedbackItem } from "./dashboard/constants";
import {
    StructuredBullet,
    StructuredJob,
    StructuredSkill,
    StructuredEducation,
    StructuredCustomSection,
    StructuredResume,
    SuggestionItem,
    cleanLine,
    toSectionTitle,
    resolveExperienceTitle,
    isProjectHeader,
    isCompanyDescriptionLine,
    parseResumeTextToStructured,
    normalizeStructuredForDisplay,
    structuredToText,
    isEmptyResume,
    hasReadableResumeText,
    DATE_RANGE_RE,
    DATE_AT_END_RE,
    ANY_DATE_RE,
} from "@/lib/resumeParser";
import { scoreStructuredResume, introducesNumbers, hasMetric, startsWithStrongActionVerb, hasWeakPhrase } from "@/lib/atsScorer";
import { patchDocx } from "@/lib/resume/patchDocx";
import { RESUME_REVIEW_VERSION } from "@/lib/resumeReviewVersion";

export type { StructuredResume, StructuredJob, StructuredBullet, SuggestionItem };


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

/** Shows each [X] (a number for the person to fill in) highlighted. */
function markPlaceholders(text: string, className: string): React.ReactNode {
    const parts = text.split(/(\[X\])/);
    if (parts.length === 1) return text;
    return parts.map((part, i) => (part === "[X]" ? <mark key={i} className={className}>[X]</mark> : <React.Fragment key={i}>{part}</React.Fragment>));
}

/** Highlights figures a rewrite suggests that the original line didn't have. */
function markNewNumbers(proposed: string, original: string, className: string): React.ReactNode {
    const had = new Set((original.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(/,/g, "")));
    const parts = proposed.split(/((?:₦|\$)?\d+(?:[.,]\d+)?\+?\s?%?)/);
    if (parts.length === 1) return markPlaceholders(proposed, className);
    return parts.map((part, i) => {
        const digits = part.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(/,/g, "");
        return digits && !had.has(digits) ? <mark key={i} className={className}>{part}</mark> : <React.Fragment key={i}>{markPlaceholders(part, className)}</React.Fragment>;
    });
}

/** Puts a suggested summary or skills section into the resume. */
function applySection(prev: StructuredResume, sug: SuggestionItem): StructuredResume {
    if (sug.type === "summary") return { ...prev, summary: sug.proposedText, summaryTitle: prev.summaryTitle || "Summary" };
    if (sug.type === "skills") {
        const skills = sug.proposedText
            .split("\n")
            .map((line) => {
                const [category, ...items] = line.split(":");
                return { category: category.trim(), items: items.join(":").trim() };
            })
            .filter((sk) => sk.category && sk.items);
        return { ...prev, skills };
    }
    return prev;
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
    // Lines whose numbers came from an accepted rewrite (kept so the score stays honest after a reload).
    let exampleLines: string[] = [];

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
                    if (Array.isArray(fb.exampleLines)) exampleLines = fb.exampleLines;
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

    const { structured, suggestions } = parseResumeTextToStructured(
        uResumeText,
        uName,
        uRole,
        uEmail,
        rawSuggestions
    );

    if (exampleLines.length > 0) {
        const marked = new Set(exampleLines);
        for (const job of structured.jobs) for (const bullet of job.bullets) if (marked.has(bullet.text)) bullet.exampleNumbers = true;
    }

    // The page always shows the score worked out from the resume as it stands.
    const initialAts = scoreStructuredResume(structured, uRole);
    uScore = initialAts.overallScore;

    const allSuggestions: SuggestionItem[] = [...suggestions];

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
        suggestions: allSuggestions,
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
    const ownSaveRef = useRef(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // A review saved before the current version is checked again once, so it
    // gets a summary that matches its score and lines to rewrite.
    const [isRefreshingReview, setIsRefreshingReview] = useState(false);
    const refreshTriedRef = useRef(false);

    const bulletRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    // The resume lives on the account. If this browser has no copy of it (a
    // new device, or its saved data was cleared), fetch it from the server
    // instead of showing "add your resume" to someone who already has one.
    const fetchedFromServerRef = useRef(false);
    useEffect(() => {
        if (!hasMounted || initialData || fetchedFromServerRef.current) return;
        if (!isEmptyResume(structuredResume)) return;
        fetchedFromServerRef.current = true;
        let cancelled = false;
        fetch("/api/auth/me", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const resumes: any[] = Array.isArray(data?.user?.resumes) ? data.user.resumes : [];
                const stored = [...resumes]
                    .filter((resume) => hasReadableResumeText(resume?.rawText))
                    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
                if (cancelled || !stored) return;
                const payload = {
                    id: stored.id,
                    resumeName: stored.name || "Resume",
                    role: data.user.role || report.role,
                    resumeText: stored.rawText,
                    score: stored.score,
                    summary: stored.summary || "",
                    strengths: stored.strengths || [],
                    suggestions: stored.suggestions || [],
                    missingKeywords: stored.missingKeywords || [],
                    reviewVersion: stored.reviewVersion,
                    updatedAt: stored.updatedAt,
                };
                try {
                    localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(payload));
                } catch {
                    // Saved data is full or blocked: the resume still shows.
                }
                const loaded = getInitialResumeState(payload);
                setReport(loaded.report);
                setStructuredResume(loaded.structured);
                setSuggestions(loaded.suggestions);
                if (loaded.suggestions.length > 0) setActiveSuggestionId(loaded.suggestions[0].id);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
        // Runs once, after the first draw, and only if there was nothing local.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMounted]);

    useEffect(() => {
        if (!hasMounted || refreshTriedRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let saved: any = null;
        try {
            saved = JSON.parse(localStorage.getItem("useladder_last_resume_feedback") || "null");
        } catch {
            return;
        }
        if (!saved?.id || saved.id === "active-cv-feedback") return;
        if ((saved.reviewVersion ?? 0) >= RESUME_REVIEW_VERSION) return;
        const text: string = saved.resumeText || saved.rawText || "";
        if (!hasReadableResumeText(text)) return;
        // Never replace a review someone has started working through.
        if (suggestions.some((s) => s.applied) || (Array.isArray(saved.exampleLines) && saved.exampleLines.length > 0)) return;

        refreshTriedRef.current = true;
        setIsRefreshingReview(true);
        fetch("/api/resume/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                resumeText: text,
                resumeName: saved.resumeName || report.resumeName || "Resume",
                role: saved.role || report.role || "Product Manager",
                domain: saved.domain || report.domain || "",
                resumeId: saved.id,
            }),
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data?.result) return;
                const updated = {
                    ...saved,
                    score: data.result.score,
                    summary: data.result.summary || saved.summary || "",
                    strengths: data.result.strengths || [],
                    suggestions: data.result.suggestions || [],
                    missingKeywords: data.result.missingKeywords || [],
                    reviewVersion: data.reviewVersion ?? RESUME_REVIEW_VERSION,
                    updatedAt: new Date().toISOString(),
                };
                try {
                    localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(updated));
                    const all = JSON.parse(localStorage.getItem("useladder_all_resume_feedbacks") || "[]");
                    if (Array.isArray(all)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(all.map((f: any) => (f?.id === updated.id ? updated : f))));
                    }
                } catch {
                    // Saved data is full or blocked: the page still shows the new review.
                }
                const loaded = getInitialResumeState(updated);
                setReport(loaded.report);
                setStructuredResume(loaded.structured);
                setSuggestions(loaded.suggestions);
                if (loaded.suggestions.length > 0) setActiveSuggestionId(loaded.suggestions[0].id);
            })
            .catch(() => undefined)
            .finally(() => setIsRefreshingReview(false));
        // Checks once the saved review (local, or fetched from the account) is in place.
    }, [hasMounted, report, suggestions]);

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
            // The page announces its own saves with this event, for the dashboard.
            // Reloading from them here threw away which rewrites had been applied.
            if (ownSaveRef.current) return;
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
        const text = report.resumeText || "";
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

                // One id for this resume, here and in the saved account.
                const newResumeId = `cv_${Date.now()}`;
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
                        resumeId: newResumeId,
                    }),
                });

                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || "Failed to parse and scan resume");
                }

                const cleanExtractedText = data.extractedText || content;
                const newScore = data.result?.score ?? 0;

                const newPayload = {
                    id: newResumeId,
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
                    reviewVersion: data.reviewVersion,
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

    const displayResume = useMemo(() => normalizeStructuredForDisplay(structuredResume), [structuredResume]);

    // Live ATS Scoring Engine based on active document state
    const liveAtsResult = useMemo(() => scoreStructuredResume(structuredResume, report.role || "Product Manager"), [structuredResume, report.role]);

    const currentScore = liveAtsResult.overallScore;
    const appliedCount = suggestions.filter((s) => s.applied).length;
    const totalCount = suggestions.length;

    // Sync rating everywhere when resume is improved (keeps Update Credentials → Coach DMs → Resume Feedback consistent)
    useEffect(() => {
        if (!hasMounted) return;
        // Nothing to save until there is a resume.
        if (isEmptyResume(displayResume)) return;
        // Avoid spamming on every keystroke – only sync when score actually changed from stored
        try {
            const rawUser = localStorage.getItem("useladder_user");
            const rawFb = localStorage.getItem("useladder_last_resume_feedback");
            let needsSync = false;
            if (rawUser) {
                const u = JSON.parse(rawUser);
                const active = u?.resume || u?.resumes?.find((r: any) => r.id === u.selectedResumeId) || u?.resumes?.[0];
                if (active && typeof active.score === "number" && active.score !== currentScore) needsSync = true;
                if (!active) needsSync = true;
            }
            if (rawFb) {
                const fb = JSON.parse(rawFb);
                if (fb && typeof fb.score === "number" && fb.score !== currentScore) needsSync = true;
            }
            if (!needsSync) return;

            // The resume as it now stands, in a form that reads back into the same structure.
            const liveFullText = isEmptyResume(displayResume) ? "" : structuredToText(displayResume);
            const exampleLinesNow = structuredResume.jobs.flatMap((job) => job.bullets.filter((bullet) => bullet.exampleNumbers).map((bullet) => bullet.text));

            if (rawUser) {
                const u = JSON.parse(rawUser);
                if (u.resume) {
                    u.resume.score = currentScore;
                    if (liveFullText) u.resume.rawText = liveFullText;
                }
                if (Array.isArray(u.resumes)) {
                    const selId = u.selectedResumeId || u.resume?.id;
                    const idx = u.resumes.findIndex((r: any) => r.id === selId);
                    if (idx >= 0) {
                        u.resumes[idx].score = currentScore;
                        if (liveFullText) u.resumes[idx].rawText = liveFullText;
                    } else if (u.resumes[0]) {
                        u.resumes[0].score = currentScore;
                        if (liveFullText) u.resumes[0].rawText = liveFullText;
                    }
                }
                localStorage.setItem("useladder_user", JSON.stringify(u));
                // persist improved rawText to last feedback as well
                if (liveFullText) {
                    try {
                        const fbRaw2 = localStorage.getItem("useladder_last_resume_feedback");
                        if (fbRaw2) {
                            const fb2 = JSON.parse(fbRaw2);
                            fb2.resumeText = liveFullText;
                            fb2.rawText = liveFullText;
                            fb2.exampleLines = exampleLinesNow;
                            fb2.score = currentScore;
                            localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(fb2));
                        }
                    } catch {}
                }
            }
            if (rawFb) {
                const fb = JSON.parse(rawFb);
                fb.score = currentScore;
                fb.exampleLines = exampleLinesNow;
                if (liveFullText) {
                    fb.resumeText = liveFullText;
                    (fb as any).rawText = liveFullText;
                }
                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(fb));
                const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                if (allRaw) {
                    const all = JSON.parse(allRaw);
                    if (Array.isArray(all) && all.length > 0) {
                        const fid = fb.id || "active-cv-feedback";
                        const foundIdx = all.findIndex((x: any) => x.id === fid);
                        if (foundIdx >= 0) {
                            all[foundIdx].score = currentScore;
                            all[foundIdx].resumeText = liveFullText || fb.resumeText;
                            (all[foundIdx] as any).rawText = liveFullText || fb.resumeText;
                        } else if (all[0]) {
                            all[0].score = currentScore;
                            if (liveFullText) {
                                all[0].resumeText = liveFullText;
                                (all[0] as any).rawText = liveFullText;
                            }
                        }
                        localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(all));
                    }
                }
            }
            ownSaveRef.current = true;
            window.dispatchEvent(new Event("useladder_resume_scanned"));
            ownSaveRef.current = false;
            // backend sync – fire and forget
            try {
                const u2 = JSON.parse(rawUser || "{}");
                const email = u2.email;
                const fb2 = JSON.parse(rawFb || "{}");
                if (email && fb2) {
                    fetch("/api/auth/user", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email,
                            resume: {
                                id: fb2.id || u2.selectedResumeId || "active-cv-feedback",
                                name: fb2.resumeName || "Resume.pdf",
                                rawText: fb2.resumeText || "",
                                score: currentScore,
                            },
                        }),
                    }).catch(() => {});
                }
            } catch {}
        } catch {}
    }, [currentScore, hasMounted, liveAtsResult.summary, displayResume, structuredResume]);

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

        if (sug.type === "summary" || sug.type === "skills") {
            setStructuredResume((prev) => applySection(prev, sug));
            setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: true } : s)));
            return;
        }

        if (sug.type === "addition") {
            setStructuredResume((prev) => ({
                ...prev,
                jobs: prev.jobs.map((job) => {
                    const match = (sug.targetJobId && job.id === sug.targetJobId) ||
                        (sug.targetJobLabel && job.company && job.company.toLowerCase().includes(sug.targetJobLabel.toLowerCase())) ||
                        (sug.targetSnippet && (job.title.toLowerCase().includes(sug.targetSnippet.slice(0, 15).toLowerCase()) || job.company.toLowerCase().includes(sug.targetSnippet.slice(0, 15).toLowerCase())));
                    if (match && !job.bullets.some((b) => b.suggestionId === sug.id || b.text === sug.proposedText)) {
                        return {
                            ...job,
                            bullets: [...job.bullets, { id: `added-${sug.id}`, text: sug.proposedText, suggestionId: sug.id }],
                        };
                    }
                    return job;
                }),
            }));
            setSuggestions((prev) =>
                prev.map((s) => (s.id === sugId ? { ...s, applied: true } : s))
            );
            return;
        }

        if (sug.fusedKeyword) setInfusedKeywords((prev) => new Set(prev).add(sug.fusedKeyword!));

        // Update document bullets
        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    if (b.suggestionId === sugId) {
                        return { ...b, text: sug.proposedText, exampleNumbers: introducesNumbers(sug.targetSnippet, sug.proposedText) || undefined };
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

        if (sug.type === "summary") {
            setStructuredResume((prev) => ({ ...prev, summary: "" }));
            setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: false } : s)));
            return;
        }
        if (sug.type === "skills") {
            setStructuredResume((prev) => ({ ...prev, skills: [] }));
            setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: false } : s)));
            return;
        }

        if (sug.type === "addition") {
            setStructuredResume((prev) => ({
                ...prev,
                jobs: prev.jobs.map((job) => ({
                    ...job,
                    bullets: job.bullets.filter((b) => b.suggestionId !== sugId && b.id !== `added-${sugId}` && b.text !== sug.proposedText),
                })),
            }));
            setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: false } : s)));
            return;
        }

        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    if (b.suggestionId === sugId) {
                        return { ...b, text: sug.targetSnippet, exampleNumbers: undefined };
                    }
                    return b;
                }),
            })),
        }));
        setSuggestions((prev) => prev.map((s) => (s.id === sugId ? { ...s, applied: false } : s)));
    };

    // Apply all improvements at once
    const handleApplyAll = () => {
        setStructuredResume((prev) => {
            let updatedJobs = prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    // Each rewrite goes to its own line and nowhere else.
                    const matchedSug = suggestions.find((s) => s.type !== "addition" && !s.applied && s.id === b.suggestionId);
                    if (matchedSug) {
                        return { ...b, text: matchedSug.proposedText, exampleNumbers: introducesNumbers(matchedSug.targetSnippet, matchedSug.proposedText) || undefined };
                    }
                    return b;
                }),
            }));

            suggestions.filter((s) => s.type === "addition" && !s.applied).forEach((sug) => {
                updatedJobs = updatedJobs.map((job) => {
                    const match = (sug.targetJobId && job.id === sug.targetJobId) ||
                        (sug.targetJobLabel && job.company && job.company.toLowerCase().includes(sug.targetJobLabel.toLowerCase())) ||
                        (sug.targetSnippet && (job.title.toLowerCase().includes(sug.targetSnippet.slice(0, 15).toLowerCase()) || job.company.toLowerCase().includes(sug.targetSnippet.slice(0, 15).toLowerCase())));
                    if (match && !job.bullets.some((b) => b.suggestionId === sug.id || b.text === sug.proposedText)) {
                        return {
                            ...job,
                            bullets: [...job.bullets, { id: `added-${sug.id}`, text: sug.proposedText, suggestionId: sug.id }],
                        };
                    }
                    return job;
                });
            });

            let next = { ...prev, jobs: updatedJobs };
            for (const sug of suggestions) if ((sug.type === "summary" || sug.type === "skills") && !sug.applied) next = applySection(next, sug);
            return next;
        });

        setSuggestions((prev) => prev.map((s) => ({ ...s, applied: true })));
    };

    // ── Everything costing points, as improvement cards, worked out when the page opens ──
    const [planState, setPlanState] = useState<"idle" | "working" | "done" | "error">("idle");
    const planTriedRef = useRef(false);

    const askForFix = async (body: Record<string, unknown>) => {
        const res = await fetch("/api/resume/improve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeText: structuredToText(displayResume), role: report.role, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "We couldn't write that just now. Please try again.");
        return data;
    };

    const stripBullet = (text: string) => text.replace(/^[•·●\u25CF]\s*/, "");

    /** Remembered per version of the resume, so reopening the page doesn't redo the work. */
    const planKey = () => {
        const text = `${report.role}|${structuredToText(displayResume)}`;
        let h = 5381;
        for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return `useladder_resume_plan:${(h >>> 0).toString(36)}`;
    };

    /** Puts plan cards in the list, each line card tied to its line in the document. */
    const showPlanCards = (cards: SuggestionItem[]) => {
        const links = new Map<string, string>();
        const usable = cards.filter((card) => {
            if (card.type === "summary") return !structuredResume.summary?.trim() && !suggestions.some((s) => s.type === "summary");
            if (card.type === "skills") return structuredResume.skills.length === 0 && !suggestions.some((s) => s.type === "skills");
            const bullet = structuredResume.jobs.flatMap((job) => job.bullets).find((b) => !b.suggestionId && stripBullet(b.text) === stripBullet(card.targetSnippet) && !links.has(b.id));
            if (!bullet) return false;
            links.set(bullet.id, card.id);
            return true;
        });
        if (links.size > 0) {
            setStructuredResume((prev) => ({
                ...prev,
                jobs: prev.jobs.map((job) => ({ ...job, bullets: job.bullets.map((b) => (links.has(b.id) ? { ...b, suggestionId: links.get(b.id) } : b)) })),
            }));
        }
        if (usable.length > 0) {
            setSuggestions((prev) => [...prev.filter((s) => !usable.some((u) => u.id === s.id)), ...usable]);
            setActiveSuggestionId((current) => current || usable[0].id);
        }
    };

    const runPlan = async () => {
        const key = planKey();
        try {
            const cached = JSON.parse(localStorage.getItem(key) || "null");
            if (Array.isArray(cached)) {
                showPlanCards(cached);
                setPlanState("done");
                return;
            }
        } catch {
            // Saved data is blocked: work it out again.
        }

        const weakLines: Array<{ text: string; issues: string[] }> = [];
        const otherLines: string[] = [];
        for (const job of structuredResume.jobs) {
            for (const b of job.bullets) {
                if (isProjectHeader(b.text) || b.suggestionId) continue;
                const issues = [...(hasMetric(b.text) ? [] : ["number"]), ...(startsWithStrongActionVerb(b.text) && !hasWeakPhrase(b.text) ? [] : ["verb"])];
                if (issues.length > 0) weakLines.push({ text: stripBullet(b.text), issues });
                else otherLines.push(stripBullet(b.text));
            }
        }
        const fullText = structuredToText(displayResume).toLowerCase();
        const missingKeywords = Array.from(new Set([...liveAtsResult.metrics.missingKeywords, ...(report.missingKeywords || [])]))
            .filter((k) => k && !fullText.includes(k.toLowerCase()) && !infusedKeywords.has(k))
            .slice(0, 8);
        const needSummary = liveAtsResult.metrics.missingSections.includes("Summary") && !suggestions.some((s) => s.type === "summary");
        const needSkills = liveAtsResult.metrics.missingSections.includes("Skills & Tools") && !suggestions.some((s) => s.type === "skills");
        if (weakLines.length === 0 && missingKeywords.length === 0 && !needSummary && !needSkills) {
            setPlanState("done");
            return;
        }

        setPlanState("working");
        try {
            const data = await askForFix({ kind: "plan", weakLines, otherLines, missingKeywords, needSummary, needSkills });
            const cards: SuggestionItem[] = [];
            if (data.summary) {
                cards.push({ id: "fix-summary", type: "summary", category: "Structure & Clarity", title: "Add a short summary at the top", feedback: "Recruiters read the top first. A summary tells them in one glance what you do and what you've achieved.", recommendation: "", targetSnippet: "", proposedText: data.summary, scoreLift: 3, applied: false });
            }
            if (Array.isArray(data.skills) && data.skills.length > 0) {
                cards.push({ id: "fix-skills", type: "skills", category: "Role Alignment & Keywords", title: "Add a skills section", feedback: "A skills section lets employers see your tools and methods at a glance, and their screening software looks for it.", recommendation: "", targetSnippet: "", proposedText: (data.skills as StructuredSkill[]).map((sk) => `${sk.category}: ${sk.items}`).join("\n"), scoreLift: 4, applied: false });
            }
            for (const r of (data.rewrites || []) as Array<{ original: string; rewritten: string; reason: string; keyword?: string }>) {
                const issues = weakLines.find((l) => l.text === r.original)?.issues || [];
                cards.push({
                    id: `plan-${cards.length}-${r.original.slice(0, 12).replace(/\W+/g, "")}`,
                    type: "edit",
                    category: r.keyword ? "Role Alignment & Keywords" : issues.includes("number") ? "Impact & Metrics" : "Action Verbs & Brevity",
                    title: r.reason,
                    feedback: r.reason,
                    recommendation: "",
                    targetSnippet: r.original,
                    proposedText: r.rewritten,
                    scoreLift: 0,
                    applied: false,
                    ...(r.keyword ? { fusedKeyword: r.keyword } : {}),
                });
            }
            try {
                localStorage.setItem(key, JSON.stringify(cards));
            } catch {
                // Saved data is full or blocked: it's worked out again next time.
            }
            showPlanCards(cards);
            setPlanState("done");
        } catch {
            setPlanState("error");
        }
    };

    // ── Suggested numbers: they count once the person says they're true ──
    const unconfirmedLines = structuredResume.jobs.reduce((n, job) => n + job.bullets.filter((b) => b.exampleNumbers).length, 0);
    const confirmNumbers = (bulletId: string) => {
        setStructuredResume((prev) => ({
            ...prev,
            jobs: prev.jobs.map((job) => ({ ...job, bullets: job.bullets.map((b) => (b.id === bulletId ? { ...b, exampleNumbers: undefined } : b)) })),
        }));
    };

    // ── Editing a line in the document ──
    type EditTarget = { kind: "bullet"; id: string } | { kind: "summary" } | { kind: "contact" };
    const [editing, setEditing] = useState<EditTarget | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const startEditing = (target: EditTarget, text: string) => {
        setEditing(target);
        setEditDraft(text.replace(/^[•·●\u25CF]\s*/, ""));
    };
    const isEditing = (target: EditTarget) =>
        editing !== null && editing.kind === target.kind && (target.kind !== "bullet" || (editing.kind === "bullet" && editing.id === target.id));
    const saveEdit = () => {
        if (!editing) return;
        const text = editDraft.replace(/\s+/g, " ").trim();
        if (editing.kind === "summary") {
            setStructuredResume((prev) => ({ ...prev, summary: text, summaryTitle: prev.summaryTitle || "Summary" }));
        } else if (editing.kind === "contact") {
            if (text) setStructuredResume((prev) => ({ ...prev, contact: text }));
        } else {
            const id = editing.id;
            let linked: string | undefined;
            setStructuredResume((prev) => ({
                ...prev,
                jobs: prev.jobs.map((job) => ({
                    ...job,
                    bullets: text
                        ? job.bullets.map((b) => {
                              if (b.id !== id) return b;
                              linked = b.suggestionId;
                              // The person typed it: their numbers now count.
                              return { ...b, text, exampleNumbers: undefined, suggestionId: undefined };
                          })
                        : job.bullets.filter((b) => b.id !== id),
                })),
            }));
            // A rewrite waiting on this line no longer fits what they wrote.
            setSuggestions((prev) => prev.filter((s) => s.id !== linked || s.applied));
        }
        setEditing(null);
    };

    /** The original Word file for this resume, from this browser or the account. */
    const loadOriginalDocx = async (): Promise<{ bytes: ArrayBuffer; name: string } | null> => {
        let resumeId = "";
        let name = report.resumeName || "Resume.docx";
        try {
            const saved = JSON.parse(localStorage.getItem("useladder_last_resume_feedback") || "null");
            if (saved?.id && saved.id !== "active-cv-feedback") resumeId = saved.id;
            if (saved?.resumeName) name = saved.resumeName;
            const user = JSON.parse(localStorage.getItem("useladder_user") || "null");
            const local = (Array.isArray(user?.resumes) ? user.resumes : []).find((r: { id?: string; data?: string }) => r.id === resumeId && typeof r.data === "string" && r.data.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
            if (local) {
                const res = await fetch(local.data);
                return { bytes: await res.arrayBuffer(), name };
            }
        } catch {
            // Saved data is blocked: try the account copy.
        }
        if (!resumeId) return null;
        const res = await fetch(`/api/resume/file?resumeId=${encodeURIComponent(resumeId)}`, { cache: "no-store" }).catch(() => null);
        if (!res || !res.ok) return null;
        return { bytes: await res.arrayBuffer(), name };
    };

    const [downloadNote, setDownloadNote] = useState<string | null>(null);
    const handleDownloadDocx = async () => {
        setDownloadNote(null);
        const original = await loadOriginalDocx().catch(() => null);
        if (original) {
            try {
                const { file, unplaced } = await patchDocx(original.bytes, structuredResume);
                const blob = new Blob([file as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = original.name.replace(/\.docx$/i, "").replace(/_\d{4}-\d{2}-\d{2}$/, "") + `_${new Date().toISOString().slice(0, 10)}.docx`;
                a.click();
                // Some browsers read the file after the click returns.
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
                setCopiedDoc(true);
                setTimeout(() => setCopiedDoc(false), 2000);
                if (unconfirmedLines > 0) setDownloadNote(`Downloaded. ${unconfirmedLines === 1 ? "One line still has" : `${unconfirmedLines} lines still have`} suggested numbers you haven't confirmed: check they're true before you send it.`);
                if (unplaced.length > 0) setDownloadNote(`${unplaced.length === 1 ? "One line" : `${unplaced.length} lines`} couldn't be placed in your file, so add ${unplaced.length === 1 ? "it" : "them"} in Word: ${unplaced.join(" / ")}`);
                return;
            } catch (err) {
                console.warn("[resume] Couldn't edit the original file, building a fresh one:", err);
            }
        }
        await buildFreshDocx();
        setDownloadNote("This copy uses our standard layout. To keep your own formatting, upload your resume as a Word (.docx) file.");
    };

    // Standardized Resume Generator — EB Garamond widely accepted template.
    // Used when there is no Word file to edit (a PDF or text upload).
    const buildFreshDocx = async () => {
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
        setSaveError(null);
        setSavedSuccess(false);
        try {
            const text = structuredToText(displayResume);
            const parsed = JSON.parse(localStorage.getItem("useladder_user") || "{}");
            const resumeItem = {
                id: report.id && report.id !== "active-cv-feedback" ? report.id : parsed.selectedResumeId || `cv_${Date.now()}`,
                name: report.resumeName || "Resume",
                data: text,
                rawText: text,
                score: currentScore,
                updatedAt: new Date().toISOString(),
            };
            const res = await fetch("/api/auth/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: parsed.email, resume: { id: resumeItem.id, name: resumeItem.name, rawText: text, score: currentScore } }),
            });
            if (!res.ok) throw new Error("save failed");

            const existing = Array.isArray(parsed.resumes) ? parsed.resumes : [];
            parsed.resumes = [resumeItem, ...existing.filter((r: { id: string }) => r.id !== resumeItem.id)];
            parsed.selectedResumeId = resumeItem.id;
            parsed.resume = resumeItem;
            localStorage.setItem("useladder_user", JSON.stringify(parsed));
            setSavedSuccess(true);
            setTimeout(() => setSavedSuccess(false), 2500);
        } catch {
            setSaveError("We couldn't save your resume just now. Please try again.");
        }
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
                structuredResume.jobs && structuredResume.jobs.length > 0
                    ? structuredResume.jobs.map((j) => `${j.title} at ${j.company}\n${j.bullets.map((b) => `- ${b.text}`).join("\n")}`).join("\n\n")
                    : (report.resumeText || "");

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

    const highlightKeyword = (text: string, keyword?: string, original?: string) => {
        const rest = (part: string) => (original !== undefined ? markNewNumbers(part, original, styles.placeholderMark) : part);
        if (!keyword || !text.toLowerCase().includes(keyword.toLowerCase())) return rest(text);
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + keyword.length);
        const after = text.slice(idx + keyword.length);
        return (
            <>
                {rest(before)}
                <span style={{ background: "#FEF08A", padding: "0 2px", borderRadius: 3, fontWeight: 700, color: "#854D0E", border: "1px solid #FDE68A" }}>{match}</span>
                {rest(after)}
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

    const hasNoResume = hasMounted && !isAnalyzingNewResume && isEmptyResume(displayResume);
    const isDocLoading = !hasMounted || isAnalyzingNewResume;

    // Once per visit, after the resume (and any refresh of an old review) is in place.
    useEffect(() => {
        if (!hasMounted || isDocLoading || isRefreshingReview || planTriedRef.current) return;
        if (structuredResume.jobs.every((job) => job.bullets.length === 0)) return;
        planTriedRef.current = true;
        void runPlan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMounted, isDocLoading, isRefreshingReview, structuredResume]);


    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (currentScore / 100) * circumference;

    const verdict = liveAtsResult.verdict || (currentScore >= 90 ? "Top 5% Resume" : currentScore >= 80 ? "Strong Candidate" : "Needs Polish");
    const verdictClass =
        currentScore >= 80
            ? styles.verdictGood
            : currentScore >= 65
            ? styles.verdictAvg
            : styles.verdictNeedsWork;

    // First draw, on the server and in the browser alike: nothing from the
    // browser's saved data. Drawing that data straight away made the page draw
    // twice and flash a placeholder score.
    if (!hasMounted) {
        return (
            <div className={styles.feedbackPage}>
                <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner} />
                    <h2 className={styles.loadingTitle}>Opening your resume…</h2>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.feedbackPage}>
            {/* Top Navigation — clean: only branding + back */}
            <nav className={styles.navbar}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                            alt="get prepped"
                            className={styles.logoImg}
                        />
                    </div>
                    <span className={styles.brandName}>get prepped</span>
                </div>
                <div className={styles.navActions}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.doc,.txt,.md"
                        style={{ display: "none" }}
                    />
                    <FeedbackButton section="Resume feedback" />
                    {onClose ? (
                        <button
                            type="button"
                            className={styles.backBtn}
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <X size={15} weight="regular" />
                            <span>Close</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={styles.backBtn}
                            onClick={() => router.replace("/dashboard")}
                        >
                            <ArrowLeft size={15} weight="regular" />
                            <span className={styles.backLabelLong}>Back to Dashboard</span>
                            <span className={styles.backLabelShort}>Back</span>
                        </button>
                    )}
                </div>
            </nav>

            <main className={styles.mainContainer}>
                {/* ── Window Header ── */}
                <div className={styles.windowHeader}>
                    <div className={styles.windowTitleGroup}>
                        <h1 className={styles.windowTitle}>Resume review</h1>
                        <p className={styles.windowSubtitle}>
                            {isDocLoading
                                ? "Reading your resume…"
                                : hasNoResume
                                ? `For ${report.role || "your role"}`
                                : `${report.resumeName || "Your resume"} · For ${report.role || "your role"}`}
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

                {/* No resume yet: say so and offer the upload. Never a sample resume. */}
                {hasNoResume && (
                    <div style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center", maxWidth: 560, margin: "2rem auto" }}>
                        <UploadSimple size={30} weight="regular" color="#4782F6" />
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 500, color: "#18181B", margin: "0.75rem 0 0.4rem", letterSpacing: "-0.01em" }}>Add your resume to get a review</h2>
                        <p style={{ fontSize: "0.9rem", lineHeight: 1.55, color: "#52525B", margin: "0 auto 1.25rem", maxWidth: "44ch" }}>
                            Upload your resume and you&rsquo;ll see how it reads for {report.role || "your role"}, with suggested rewrites for the lines that could be stronger.
                        </p>
                        <button
                            type="button"
                            className={styles.improverActionSmallBtn}
                            onClick={() => fileInputRef.current?.click()}
                            style={{ background: "linear-gradient(135deg, #4782F6 0%, #3B71E8 100%)", color: "#FFFFFF", borderColor: "transparent", padding: "0.6rem 1.2rem", fontSize: "0.88rem" }}
                        >
                            <UploadSimple size={15} weight="bold" /> Upload resume
                        </button>
                        <p style={{ fontSize: "0.78rem", color: "#71717A", margin: "0.75rem 0 0" }}>PDF, Word, or plain text</p>
                        {analyzeError && <p role="alert" style={{ fontSize: "0.82rem", color: "#B91C1C", margin: "0.9rem 0 0" }}>{analyzeError}</p>}
                    </div>
                )}

                {!hasNoResume && (<>
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
                            {liveAtsResult.seniority && (
                                <span style={{ fontSize: "0.78rem", color: "#64748B", fontWeight: 500, marginLeft: "0.5rem" }}>
                                    Experience: <strong style={{ color: "#334155" }}>{liveAtsResult.seniority.label}</strong> ({liveAtsResult.seniority.totalYears} years)
                                </span>
                            )}
                        </div>

                        <p className={styles.summaryParagraph}>
                            {report.summary || liveAtsResult.summary}
                        </p>

                        <div className={styles.rubricRow}>
                            <div className={styles.rubricPill}>
                                <span>Impact & Metrics:</span>
                                <span className={styles.rubricVal}>
                                    {liveAtsResult.metrics.impactScore}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Role Alignment:</span>
                                <span className={styles.rubricVal}>
                                    {liveAtsResult.metrics.roleAlignmentScore}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Action Verbs:</span>
                                <span className={styles.rubricVal}>
                                    {liveAtsResult.metrics.brevityScore}%
                                </span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Layout:</span>
                                <span className={styles.rubricVal}>{liveAtsResult.metrics.structureScore}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Single Unified Workspace: Suggestions Left, Document Right ── */}
                <div className={styles.unifiedWorkspace}>
                    <div className={styles.unifiedGrid}>
                        {/* ── LEFT COLUMN: Actionable Suggestions ── */}
                        <div className={styles.suggestionsSidebar}>
                            {isRefreshingReview && (
                                <p role="status" className={styles.scoreGapDetail} style={{ margin: 0 }}>
                                    Updating your review with the latest checks…
                                </p>
                            )}
                            {/* Contact details can't be written for them: point to the line instead. */}
                            {!isDocLoading && liveAtsResult.metrics.contactPoints < 10 && (
                                <div className={styles.scoreGaps}>
                                    <span className={styles.scoreGapName}>Complete your contact details</span>
                                    <p className={styles.scoreGapDetail}>Put your full name, email and phone number or LinkedIn link at the top.</p>
                                    <button type="button" className={styles.scoreGapAction} onClick={() => startEditing({ kind: "contact" }, structuredResume.contact || "")}>
                                        Edit contact line
                                    </button>
                                </div>
                            )}
                            <div className={styles.suggestionsToolbar}>
                                <span className={styles.suggestionsCountLabel}>
                                    <span>
                                        {totalCount === 0 ? "Suggested rewrites" : `${appliedCount} of ${totalCount} improvements applied`}
                                    </span>
                                </span>
                                {appliedCount < totalCount && (
                                    <button
                                        type="button"
                                        className={styles.suggestionsApplyAllBtn}
                                        onClick={handleApplyAll}
                                        title="Apply every suggested rewrite"
                                    >
                                        Apply All
                                    </button>
                                )}
                            </div>

                            {unconfirmedLines > 0 && (
                                <p className={styles.scoreGapDetail} style={{ margin: 0 }}>
                                    {unconfirmedLines === 1 ? "One line has" : `${unconfirmedLines} lines have`} suggested numbers. Check each is true, then press &ldquo;Numbers are right&rdquo; on the line so your score counts it.
                                </p>
                            )}
                            {planState === "working" && (
                                <p role="status" className={styles.scoreGapDetail} style={{ margin: 0 }}>
                                    Checking every line for what will raise your score…
                                </p>
                            )}
                            {planState === "error" && (
                                <p role="alert" className={styles.scoreGapError}>
                                    We couldn&rsquo;t finish checking your resume.{" "}
                                    <button
                                        type="button"
                                        className={styles.scoreGapAction}
                                        onClick={() => {
                                            setPlanState("idle");
                                            void runPlan();
                                        }}
                                    >
                                        Try again
                                    </button>
                                </p>
                            )}

                            {/* Suggestions List — identical rewrites are filtered, section is marked okay */}
                            {isDocLoading || (planState === "working" && suggestions.length === 0) ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className={styles.docSkeletonCard} style={{ height: "115px", borderRadius: "10px" }} />
                                    ))}
                                </div>
                            ) : suggestions.length === 0 && planState !== "working" ? (
                                <div style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", borderRadius: 10, padding: "0.9rem 1rem", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <CheckCircle size={18} weight="fill" color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#166534" }}>Your resume is in good shape</div>
                                        <div style={{ fontSize: "0.76rem", color: "#15803D", lineHeight: 1.45, marginTop: 3 }}>
                                            Nothing here needs changing. Anything that could raise your score would be listed here.
                                        </div>
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
                                                {sug.title}
                                            </h4>
                                        </div>


                                        {/* Original — full, red callout for edits, or target context for additions */}
                                        {sug.type === "summary" || sug.type === "skills" ? (
                                            <div className={styles.suggestionTargetSnippet} style={{ background: "#F1F5F9", borderLeft: "2px solid #64748B", color: "#334155", display: "block", WebkitLineClamp: "unset", overflow: "visible", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>New section</span>
                                                {sug.type === "summary" ? "A summary under your name and contact details" : "A skills section"}
                                            </div>
                                        ) : sug.type === "addition" ? (
                                            <div className={styles.suggestionTargetSnippet} title="Target Role" style={{ background: "#F1F5F9", borderLeft: "2px solid #64748B", color: "#334155", display: "block", WebkitLineClamp: "unset", overflow: "visible", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Target Role</span>
                                                Add new bullet to <strong>{sug.targetJobLabel || "Experience"}</strong>
                                            </div>
                                        ) : (
                                            <div className={styles.suggestionTargetSnippet} title="Original" style={{ background: "#FEF2F2", borderLeft: "2px solid #EF4444", color: "#991B1B", display: "block", WebkitLineClamp: "unset", overflow: "visible", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#DC2626", display: "block", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Original</span>
                                                &ldquo;{sug.targetSnippet}&rdquo;
                                            </div>
                                        )}

                                        {/* Improvement — green bg */}
                                        <div className={styles.suggestionProposedBox}>
                                            <strong>Improvement:</strong>{" "}
                                            {sug.fusedKeyword ? (
                                                highlightKeyword(sug.proposedText, sug.fusedKeyword, sug.type === "edit" ? sug.targetSnippet : undefined)
                                            ) : sug.type === "skills" ? (
                                                <span style={{ whiteSpace: "pre-line" }}>{sug.proposedText}</span>
                                            ) : sug.type === "summary" ? (
                                                sug.proposedText
                                            ) : (
                                                markNewNumbers(sug.proposedText, sug.targetSnippet, styles.placeholderMark)
                                            )}
                                        </div>

                                        {sug.type !== "addition" && sug.type !== "summary" && sug.type !== "skills" && introducesNumbers(sug.targetSnippet, sug.proposedText) && (
                                            <p style={{ margin: "0.45rem 0 0", fontSize: "0.72rem", lineHeight: 1.4, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "0.35rem 0.5rem" }}>
                                                The highlighted numbers are estimates from the rest of your resume. Once it&rsquo;s in, press &ldquo;Numbers are right&rdquo; on the line if they&rsquo;re true, or Edit to change them.
                                            </p>
                                        )}

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
                                <div id="missing-keywords" style={{ background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: "10px", padding: "1rem" }}>
                                    <div style={{ marginBottom: "0.5rem" }}>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0F172A" }}>
                                            Missing High-Impact Keywords
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.76rem", color: "#64748B", margin: "0 0 0.65rem", lineHeight: 1.4 }}>
                                        Employers&rsquo; screening software looks for these words. <span style={{ color: "#0F172A", fontWeight: 600 }}>Copy</span> one, or <span style={{ color: "#475569", fontWeight: 600 }}>Add</span> it to a line you already have.
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
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Replace this with a different resume file"
                                    >
                                        <UploadSimple size={14} weight="bold" /> Upload a resume
                                    </button>
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

                            {downloadNote && (
                                <p role="status" className={styles.scoreGapDetail} style={{ margin: 0, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, padding: "0.55rem 0.85rem" }}>
                                    {downloadNote}
                                </p>
                            )}

                            {savedSuccess && (
                                <div style={{ color: "#15803D", background: "#F0FDF4", border: "1px solid #DCFCE7", padding: "0.55rem 0.85rem", borderRadius: 7, fontSize: "0.78rem" }}>
                                    Saved to your profile.
                                </div>
                            )}
                            {saveError && (
                                <div role="alert" style={{ color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", padding: "0.55rem 0.85rem", borderRadius: 7, fontSize: "0.78rem" }}>
                                    {saveError}
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
                                    {isEditing({ kind: "contact" }) ? (
                                        <LineEditor value={editDraft} onChange={setEditDraft} onSave={saveEdit} onCancel={() => setEditing(null)} label="Contact line" />
                                    ) : (
                                        <p className={styles.docSubtitle} style={{ marginTop: "0.25rem", color: "#94A3B8" }}>
                                            {renderWithLinks(displayResume.contact)}
                                            <button type="button" className={styles.docEditBtn} onClick={() => startEditing({ kind: "contact" }, structuredResume.contact || "")}>
                                                Edit
                                            </button>
                                        </p>
                                    )}
                                </div>

                                {/* Professional Summary — only if present in original */}
                                {((displayResume.summary && displayResume.summary.trim()) || isEditing({ kind: "summary" })) && (
                                    <div className={styles.docSection}>
                                        <h2 className={styles.docSectionHeader}>{displayResume.summaryTitle || "Professional Summary"}</h2>
                                        {isEditing({ kind: "summary" }) ? (
                                            <LineEditor value={editDraft} onChange={setEditDraft} onSave={saveEdit} onCancel={() => setEditing(null)} label="Summary" rows={4} />
                                        ) : (
                                            <p className={styles.docSummaryText}>
                                                {markPlaceholders(displayResume.summary || "", styles.placeholderMark)}
                                                <button type="button" className={styles.docEditBtn} onClick={() => startEditing({ kind: "summary" }, structuredResume.summary || "")}>
                                                    Edit
                                                </button>
                                            </p>
                                        )}
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
                                                                                    {isEditing({ kind: "bullet", id: b.id }) ? (
                                                                                        <span style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                                                                                            <LineEditor value={editDraft} onChange={setEditDraft} onSave={saveEdit} onCancel={() => setEditing(null)} label="Resume line" hint="Leave it empty and save to remove the line." />
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ flex: 1 }}>
                                                                                            {markPlaceholders(b.text.replace(/^[•·●\u25CF]\s*/, ""), styles.placeholderMark)}
                                                                                            <button
                                                                                                type="button"
                                                                                                className={styles.docEditBtn}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    startEditing({ kind: "bullet", id: b.id }, b.text);
                                                                                                }}
                                                                                            >
                                                                                                Edit
                                                                                            </button>
                                                                                            {b.exampleNumbers && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className={styles.docConfirmBtn}
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        confirmNumbers(b.id);
                                                                                                    }}
                                                                                                    title="These numbers are true for you"
                                                                                                >
                                                                                                    Numbers are right
                                                                                                </button>
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                    {matchingSug && !isApplied && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "#2563EB", background: "#DBEAFE", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, flexShrink: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                                                                            Suggestion Available
                                                                                        </span>
                                                                                    )}
                                                                                    {!matchingSug && suggestions.length > 0 && (
                                                                                        <span style={{ fontSize: "0.68rem", color: "#475569", background: "#F1F5F9", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600, flexShrink: 0, border: "1px solid #E2E8F0", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }} title="No rewrite suggested for this line">
                                                                                            No change needed
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
                </>)}

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
                                Reading your resume
                            </h3>
                            <p style={{ fontSize: "0.82rem", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
                                This usually takes about half a minute.
                            </p>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}


/** Editing one part of the resume in place: Enter or Save keeps it, Escape or Cancel leaves it. */
function LineEditor({ value, onChange, onSave, onCancel, label, hint, rows = 2 }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; label: string; hint?: string; rows?: number }) {
    return (
        <span className={styles.lineEditor}>
            <textarea
                aria-label={label}
                autoFocus
                rows={rows}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSave();
                    } else if (e.key === "Escape") {
                        onCancel();
                    }
                }}
            />
            <span className={styles.lineEditorRow}>
                {hint && <span className={styles.lineEditorHint}>{hint}</span>}
                <button type="button" className={styles.lineEditorCancel} onClick={onCancel}>
                    Cancel
                </button>
                <button type="button" className={styles.lineEditorSave} onClick={onSave}>
                    Save
                </button>
            </span>
        </span>
    );
}
