import React from "react";
import { ArrowSquareOut, FileText, Play } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "@/components/dashboard.module.css";
import css from "./jobs.module.css";
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
        <div className={`${css.row} ${isLast ? "" : css.rowDivider}`}>
            <div className={styles.lessonCompanyLogoWrap} style={{ width: "40px", height: "40px" }}>
                <CompanyLogo company={job.company} logoUrl={job.companyLogo} size={40} />
            </div>

            <div className={css.info}>
                <div className={css.jobTitle}>{cleanJobTitle(job.title)}</div>
                <div className={css.meta}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F172A" }}>{job.company}</span>
                    <span className={styles.jobLocationTag}>
                        {job.location}
                        {job.moreLocations ? ` +${job.moreLocations} more location${job.moreLocations > 1 ? "s" : ""}` : ""}
                    </span>
                    {job.salaryRange && job.salaryRange !== "Competitive" && (
                        <span style={{ fontSize: "11px", color: "#166534", background: "#DCFCE7", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            {job.salaryRange}
                        </span>
                    )}
                </div>
            </div>

            <div className={css.actions}>
            <button
                type="button"
                className={styles.jobDescBtn}
                onClick={() => onOpenDesc(job)}
                title="Job description"
            >
                <FileText size={14} weight="regular" /> <span>View details</span>
            </button>

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
