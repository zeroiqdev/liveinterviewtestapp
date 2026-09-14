import React from "react";
import { ArrowSquareOut, FileText, Play } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "@/components/dashboard.module.css";
import { CompanyLogo } from "./CompanyLogo";
import { cleanJobTitle } from "../dashboard/utils";

interface JobRowProps {
    job: JobItem;
    isLast: boolean;
    onOpenDesc: (job: JobItem) => void;
    onPractice: () => void;
}

function JobRowComponent({ job, isLast, onOpenDesc, onPractice }: JobRowProps) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem 1.25rem",
                borderBottom: isLast ? "none" : "1px solid #F1F5F9",
                transition: "background 0.15s ease",
            }}
        >
            <div className={styles.lessonCompanyLogoWrap} style={{ width: "40px", height: "40px" }}>
                <CompanyLogo company={job.company} url={job.url} logoUrl={job.companyLogo} />
            </div>

            <div>
                <div style={{ fontWeight: 400, color: "#0F172A", fontSize: "0.95rem", marginBottom: "4px" }}>
                    {cleanJobTitle(job.title)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F172A" }}>{job.company}</span>
                    <span className={styles.jobLocationTag}>
                        {job.location}
                    </span>
                    {job.salaryRange && job.salaryRange !== "Competitive" && (
                        <span style={{ fontSize: "11px", color: "#166534", background: "#DCFCE7", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            {job.salaryRange}
                        </span>
                    )}
                </div>
            </div>

            <button
                type="button"
                className={styles.jobDescBtn}
                onClick={() => onOpenDesc(job)}
            >
                <FileText size={13} /> Job Description
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                    type="button"
                    className={styles.roleSimulateBtn}
                    onClick={onPractice}
                >
                    <Play size={12} weight="fill" /> Practice
                </button>
                {job.url && job.url !== "#" && (
                    <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "30px", height: "30px", borderRadius: "6px", background: "#F8FAFC", color: "#64748B", border: "1px solid #CBD5E1", textDecoration: "none" }}
                        title="View Original Job Post"
                    >
                        <ArrowSquareOut size={14} weight="bold" />
                    </a>
                )}
            </div>
        </div>
    );
}

export const JobRow = React.memo(JobRowComponent);
