import React from "react";
import { Play } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "../dashboard.module.css";
import { CompanyLogo } from "./CompanyLogo";
import { formatJobMeta, cleanJobTitle } from "./utils";

interface JobPickRowProps {
    job: JobItem;
    onOpen: (job: JobItem) => void;
    onPractice: () => void;
}

function JobPickRowComponent({ job, onOpen, onPractice }: JobPickRowProps) {
    const metaString = formatJobMeta(job);
    return (
        <div
            className={styles.jobPickRow}
            onClick={() => onOpen(job)}
            title={`View role details for ${job.title} at ${job.company}`}
        >
            <div className={styles.jobPickLogoWrap}>
                <CompanyLogo company={job.company} url={job.url} logoUrl={job.companyLogo} />
            </div>
            <div className={styles.jobPickInfo}>
                <div className={styles.jobPickTitle}>{cleanJobTitle(job.title)}</div>
                <div className={styles.jobPickMeta}>
                    {metaString}
                </div>
            </div>
            <button
                type="button"
                className={styles.jobRowPracticeBtn}
                onClick={(e) => {
                    e.stopPropagation();
                    onPractice();
                }}
                title={`Practice mock interview for ${job.title} at ${job.company}`}
            >
                <Play size={11} weight="fill" />
                Practice
            </button>
        </div>
    );
}

export const JobPickRow = React.memo(JobPickRowComponent);
