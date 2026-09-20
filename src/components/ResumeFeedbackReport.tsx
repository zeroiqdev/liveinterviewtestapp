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
    DATE_RANGE_RE,
    DATE_AT_END_RE,
    ANY_DATE_RE,
} from "@/lib/resumeParser";
import { calculateStructuredAtsScore, calculateAtsScore, AtsScoreResult } from "@/lib/atsScorer";

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

    const initialAts = calculateStructuredAtsScore(structured, uRole, uResumeText);
    if (!uScore || uScore === 82) {
        uScore = initialAts.overallScore;
    }
    if (!uSummary || uSummary.includes("inline editor")) {
        uSummary = initialAts.summary;
    }
    if (initialAts.strengths.length > 0 && (uStrengths.length <= 3 && uStrengths[0]?.includes("milestones"))) {
        uStrengths = initialAts.strengths;
    }
    if (initialAts.metrics.missingKeywords.length > 0 && uMissingKeywords.includes("Quantifiable Metrics")) {
        uMissingKeywords = initialAts.metrics.missingKeywords;
    }

    const allSuggestions: SuggestionItem[] = [...suggestions];
    for (const extra of initialAts.extraBulletSuggestions) {
        if (!allSuggestions.some((s) => s.id === extra.id || s.proposedText === extra.proposedText)) {
            allSuggestions.push({
                id: extra.id,
                category: extra.category,
                title: extra.recommendation,
                feedback: extra.feedback,
                recommendation: extra.recommendation,
                targetSnippet: extra.targetSnippet,
                proposedText: extra.proposedText,
                scoreLift: extra.scoreLift,
                applied: false,
                type: "addition",
                targetJobId: extra.targetJobId,
                targetJobLabel: extra.targetCompany,
            });
        }
    }

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

    const displayResume = useMemo(() => normalizeStructuredForDisplay(structuredResume), [structuredResume]);

    // Live ATS Scoring Engine based on active document state
    const liveAtsResult = useMemo(() => {
        const liveText = [
            displayResume.name,
            displayResume.headline,
            displayResume.contact,
            displayResume.summaryTitle || "Professional Summary",
            displayResume.summary,
            displayResume.experienceTitle || "Product Management Experience",
            displayResume.jobs.map((j) => `${j.title} at ${j.company} (${j.date || ""})\n${j.bullets.map((b) => b.text).join("\n")}`).join("\n\n"),
            displayResume.skillsTitle || "Technical Competencies & Skills",
            (displayResume.skills || []).map((s) => `${s.category}: ${s.items}`).join("\n"),
            (displayResume.education || []).map((e) => `${e.degree} at ${e.institution} (${e.date || ""})`).join("\n"),
        ].filter(Boolean).join("\n\n");

        return calculateStructuredAtsScore(displayResume, report.role, liveText);
    }, [displayResume, report.role]);

    const currentScore = liveAtsResult.overallScore;
    const appliedCount = suggestions.filter((s) => s.applied).length;
    const totalCount = suggestions.length;

    // Sync rating everywhere when resume is improved (keeps Update Credentials → Coach DMs → Resume Feedback consistent)
    useEffect(() => {
        if (!hasMounted) return;
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

            // Build live full resume text from current structured state (improved bullets)
            let liveFullText = "";
            try {
                liveFullText = [
                    displayResume.name,
                    displayResume.headline,
                    displayResume.contact,
                    displayResume.summaryTitle || "Professional Summary",
                    displayResume.summary,
                    displayResume.experienceTitle || "Experience",
                    ...displayResume.jobs.flatMap((j) => [j.title, j.company, j.date || "", ...j.bullets.map((b) => b.text)]),
                    displayResume.skillsTitle || "Skills",
                    ...(displayResume.skills || []).map((s) => `${s.category}: ${s.items}`),
                    ...(displayResume.education || []).map((e) => `${e.degree} ${e.institution} ${e.date || ""}`),
                ]
                    .filter(Boolean)
                    .join("\n\n");
            } catch {}

            if (rawUser) {
                const u = JSON.parse(rawUser);
                if (u.resume) {
                    u.resume.score = currentScore;
                    if (liveFullText) u.resume.rawText = liveFullText;
                }
                if (Array.isArray(u.resumes)) {
                    const selId = u.selectedResumeId || u.resume?.id;
                    let idx = u.resumes.findIndex((r: any) => r.id === selId);
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
                            fb2.score = currentScore;
                            fb2.summary = liveAtsResult.summary || fb2.summary;
                            localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(fb2));
                        }
                    } catch {}
                }
            }
            if (rawFb) {
                const fb = JSON.parse(rawFb);
                fb.score = currentScore;
                fb.summary = liveAtsResult.summary || fb.summary;
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
                            all[foundIdx].summary = fb.summary;
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
            window.dispatchEvent(new Event("useladder_resume_scanned"));
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
        setStructuredResume((prev) => {
            let updatedJobs = prev.jobs.map((job) => ({
                ...job,
                bullets: job.bullets.map((b) => {
                    const matchedSug = suggestions.find(
                        (s) => s.type !== "addition" && (s.id === b.suggestionId || b.text.includes(s.targetSnippet.slice(0, 30)))
                    );
                    if (matchedSug) {
                        return { ...b, text: matchedSug.proposedText };
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

            return { ...prev, jobs: updatedJobs };
        });

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

    const isDocLoading = !hasMounted || isAnalyzingNewResume || !displayResume.name || displayResume.jobs.length === 0;

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

    return (
        <div className={styles.feedbackPage}>
            {/* Top Navigation — clean: only branding + back */}
            <nav className={styles.navbar}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1789904880/Gemini_Generated_Image_k81ahgk81ahgk81a-removebg-preview_fby74s.png"
                            alt="onscript"
                            className={styles.logoImg}
                        />
                    </div>
                    <span className={styles.brandName}>onscript</span>
                </div>
                <div className={styles.navActions}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.doc,.txt,.md"
                        style={{ display: "none" }}
                    />
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
                            <span>Back to Dashboard</span>
                        </button>
                    )}
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
                            {liveAtsResult.seniority && (
                                <span style={{ fontSize: "0.78rem", color: "#64748B", fontWeight: 500, marginLeft: "0.5rem" }}>
                                    Experience Tier: <strong style={{ color: "#334155" }}>{liveAtsResult.seniority.label}</strong> ({liveAtsResult.seniority.totalYears} yrs detected)
                                </span>
                            )}
                        </div>

                        <p className={styles.summaryParagraph}>
                            {report.summary || "Your resume displays solid technical depth. Select any suggestion on the left to highlight and implement Google X-Y-Z bullet points directly into your document on the right."}
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
                                <span>Structure & ATS:</span>
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


                                        {/* Original — full, red callout for edits, or target context for additions */}
                                        {sug.type === "addition" ? (
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
