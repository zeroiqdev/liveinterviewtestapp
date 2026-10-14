"use client";

import React, { useEffect, useState } from "react";
import type { Headline, ProductMetrics } from "@/lib/productMetrics";
import styles from "@/components/admin.module.css";
import m from "./metrics.module.css";

function naira(amount: number): string {
    return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

function shortWeek(iso: string): string {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** One headline number: the share, what it's out of, and what it means. */
function Tile({ title, value, detail, help }: { title: string; value: Headline; detail?: string; help: string }) {
    return (
        <div className={m.tile} title={help}>
            <span className={m.tileTitle}>{title}</span>
            <span className={m.tileValue}>{value.percent === null ? "—" : `${value.percent}%`}</span>
            <span className={m.tileDetail}>{value.of === 0 ? "No one to measure yet" : detail ?? `of ${value.of}`}</span>
            <span className={m.tileHelp}>{help}</span>
        </div>
    );
}

function Bars({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return (
        <div className={m.card}>
            <h3 className={m.cardTitle}>{title}</h3>
            {rows.length === 0 ? (
                <p className={m.empty}>Nothing yet.</p>
            ) : (
                <ul className={m.bars}>
                    {rows.map((row) => (
                        <li key={row.label}>
                            <span className={m.barLabel}>{row.label}</span>
                            <span className={m.barTrack}>
                                <i style={{ width: `${(row.count / max) * 100}%` }} />
                            </span>
                            <span className={m.barCount}>{row.count}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Admin: is the product delivering value, do people come back, and do they pay. */
export function MetricsPanel() {
    const [data, setData] = useState<ProductMetrics | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        fetch("/api/admin/metrics", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then(setData)
            .catch(() => setFailed(true));
    }, []);

    if (failed) return <p className={m.empty}>Couldn&rsquo;t load the metrics. Refresh to try again.</p>;
    if (!data) return <p className={m.empty}>Working out the numbers…</p>;

    const hours = data.activation.medianHoursToFirst;
    const toFirst = hours === null ? null : hours < 1 ? "under an hour" : hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;

    return (
        <div className={m.wrap}>
            <div className={m.tiles}>
                <Tile
                    title="Start an interview"
                    value={data.activation}
                    detail={`of ${data.activation.of} sign-ups${toFirst ? ` · typically within ${toFirst}` : ""}`}
                    help="Share of people who signed up and then started at least one interview."
                />
                <Tile title="Finish their first" value={data.completion} detail={`of ${data.completion.of} who started`} help="Share of people who started an interview and got a report." />
                <Tile
                    title="Come back within a week"
                    value={data.secondInterview}
                    detail={`of ${data.secondInterview.of} whose first was a week ago`}
                    help="Started a second interview within 7 days of the first. The best early sign that practising is useful."
                />
                <Tile
                    title="Pay after the free one"
                    value={data.paywallConversion}
                    detail={`of ${data.paywallConversion.of} who used it`}
                    help="Share of people who used their free interview and then bought a pass."
                />
                <Tile
                    title="Practise in week two"
                    value={data.weekOneRetention}
                    detail={`of ${data.weekOneRetention.of} who joined 2+ weeks ago`}
                    help="Started an interview 7 to 14 days after signing up."
                />
            </div>

            <div className={m.row}>
                <div className={m.card}>
                    <h3 className={m.cardTitle}>Revenue</h3>
                    <div className={m.money}>
                        <div>
                            <b>{naira(data.revenue.last30Days)}</b>
                            <span>Last 30 days</span>
                        </div>
                        <div>
                            <b>{naira(data.revenue.total)}</b>
                            <span>All time</span>
                        </div>
                        <div>
                            <b>{data.revenue.payers}</b>
                            <span>People who paid</span>
                        </div>
                        <div>
                            <b>{data.revenue.repeatPayers}</b>
                            <span>Paid more than once</span>
                        </div>
                    </div>
                </div>
                <div className={m.card}>
                    <h3 className={m.cardTitle}>Try before sign-up · last 7 days</h3>
                    <ol className={m.funnel}>
                        <li>
                            <b>{data.trial.started}</b>
                            <span>Pasted a job description</span>
                        </li>
                        <li>
                            <b>{data.trial.finished}</b>
                            <span>Answered both questions</span>
                        </li>
                        <li>
                            <b>{data.trial.carriedOn}</b>
                            <span>Signed up and carried on</span>
                        </li>
                    </ol>
                    <p className={m.note}>Unfinished tries are deleted after 7 days, so this shows the last week only.</p>
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableWrap}>
                    <table className={styles.adminTable}>
                        <thead>
                            <tr>
                                <th>Week of</th>
                                <th className={m.num}>Sign-ups</th>
                                <th className={m.num}>Interviews started</th>
                                <th className={m.num}>Finished</th>
                                <th className={m.num}>People practising</th>
                                <th className={m.num}>Payers</th>
                                <th className={m.num}>Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...data.weeks].reverse().map((week) => (
                                <tr key={week.week}>
                                    <td>{shortWeek(week.week)}</td>
                                    <td className={m.num}>{week.signUps}</td>
                                    <td className={m.num}>{week.interviewsStarted}</td>
                                    <td className={m.num}>{week.interviewsCompleted}</td>
                                    <td className={m.num}>{week.activePractisers}</td>
                                    <td className={m.num}>{week.payers}</td>
                                    <td className={m.num}>{naira(week.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={m.row3}>
                <Bars title="Sign-ups by role" rows={data.signUpsByRole} />
                <Bars title="How people sign up" rows={data.signUpsByMethod} />
                <Bars title="Finished interviews by mode" rows={data.interviewsByMode} />
            </div>
        </div>
    );
}
