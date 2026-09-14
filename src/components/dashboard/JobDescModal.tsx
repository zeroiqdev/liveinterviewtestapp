import React from "react";
import { ArrowSquareOut, Play, X } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "../dashboard.module.css";
import { CompanyLogo } from "./CompanyLogo";
import { generateRoleOverview } from "@/services/careerPageScraper";
import { cleanJobTitle } from "./utils";

interface JobDescModalProps {
    job: JobItem;
    onClose: () => void;
    onPractice: () => void;
    calibrationSectionTitle?: string;
    calibrationText?: string;
}

function JobDescModalComponent({ job, onClose, onPractice, calibrationSectionTitle = "AI Mock Interview Calibration", calibrationText }: JobDescModalProps) {
    return (
        <div className={styles.jobModalBackdrop} onClick={onClose}>
            <div className={styles.jobModalBox} onClick={(e) => e.stopPropagation()}>
                <div className={styles.jobModalHeader}>
                    <div className={styles.jobModalTitleGroup}>
                        <CompanyLogo company={job.company} url={job.url} logoUrl={job.companyLogo} />
                        <div>
                            <h3 className={styles.jobModalTitle}>{cleanJobTitle(job.title)}</h3>
                            <div className={styles.jobModalSub}>{job.company} · {job.employmentType || "Full-time"}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.jobModalCloseBtn}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={16} weight="bold" />
                    </button>
                </div>

                <div className={styles.jobModalBody}>
                    <div className={styles.jobModalMetaGrid}>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Location</span>
                            <span className={styles.jobModalMetaVal}>{job.location}</span>
                        </div>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Compensation</span>
                            <span className={styles.jobModalMetaVal}>{job.salaryRange || "Competitive / Market Standard"}</span>
                        </div>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Employment Type</span>
                            <span className={styles.jobModalMetaVal}>{job.employmentType || "Full-time"}</span>
                        </div>
                    </div>

                    <div>
                        <h4 className={styles.jobModalSectionTitle}>Role Overview & Key Responsibilities</h4>
                        <p className={styles.jobModalText}>
                            {job.description && !job.description.startsWith("Portfolio company of")
                                ? job.description
                                : generateRoleOverview(job.title, job.roleFamily, job.company, job.location)}
                        </p>
                    </div>

                    <div>
                        <h4 className={styles.jobModalSectionTitle}>{calibrationSectionTitle}</h4>
                        <p className={styles.jobModalText}>
                            {calibrationText || `Practice real-time technical and behavioral interview rounds customized for ${job.company}'s hiring rubric with our live AI Interview Coach and Recruiter.`}
                        </p>
                    </div>
                </div>

                <div className={styles.jobModalFooter}>
                    {job.url && job.url !== "#" && (
                        <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "6px", background: "#FFFFFF", color: "#334155", border: "1px solid #CBD5E1", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
                        >
                            Apply on Site <ArrowSquareOut size={13} weight="bold" />
                        </a>
                    )}
                    <button
                        type="button"
                        className={styles.roleSimulateBtn}
                        style={{ padding: "8px 16px", fontSize: "13px" }}
                        onClick={onPractice}
                    >
                        <Play size={13} weight="fill" /> Practice
                    </button>
                </div>
            </div>
        </div>
    );
}

export const JobDescModal = React.memo(JobDescModalComponent);
