"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, MagnifyingGlass } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import styles from "@/components/dashboard.module.css";
const PaymentModal = dynamic(() => import("@/components/PaymentModal"));
import { detectUserLocation, UserLocation, isJobRoleMatch, normalizeUserRoleFamily, scoreJobForLocation } from "@/utils/locationDetector";
import type { JobItem } from "@/app/api/jobs/route";
import { JobRow } from "@/components/jobs/JobRow";
import { JobDescModal } from "@/components/dashboard/JobDescModal";

const selectStyle = { height: "38px", padding: "0 10px", borderRadius: "6px", border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: "13px", color: "#0F172A", outline: "none", cursor: "pointer", fontWeight: 500 };

export default function AllJobsPage() {
    const router = useRouter();
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [userRole, setUserRole] = useState<string | null>(null);
    const [roleFilter, setRoleFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("active"); // "active" | "all" | "expired"
    const [freshnessFilter, setFreshnessFilter] = useState("all"); // "all" | "7d" | "14d"
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [selectedJobDesc, setSelectedJobDesc] = useState<JobItem | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            const loc = await detectUserLocation();
            if (cancelled) return;
            setUserLocation(loc);

            // Read user's target career role from onboarding
            const rawUser = localStorage.getItem("useladder_user");
            if (rawUser) {
                try {
                    const parsed = JSON.parse(rawUser);
                    if (parsed.role) {
                        setUserRole(parsed.role);
                        setRoleFilter(normalizeUserRoleFamily(parsed.role)); // Tailor by default to user's role
                    }
                } catch {
                    // Ignore
                }
            }

            try {
                const res = await fetch("/api/jobs?status=active");
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setJobs(data.jobs || []);
                }
            } catch {
                // Ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        init();
        return () => {
            cancelled = true;
        };
    }, []);

    const filteredJobs = useMemo(() => {
        if (loading) return [];
        return jobs.filter((job) => {
            // 0. Status filter: Active (default) vs Expired
            const isJobExpired = job.status === "expired";
            if (statusFilter === "active" && isJobExpired) return false;
            if (statusFilter === "expired" && !isJobExpired) return false;

            // 0b. Freshness filter
            if (freshnessFilter === "7d") {
                const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                if (job.datePosted < cutoff) return false;
            } else if (freshnessFilter === "14d") {
                const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                if (job.datePosted < cutoff) return false;
            }

            // 1. Search filter
            if (search.trim()) {
                const q = search.toLowerCase();
                const text = (job.title + " " + job.company + " " + job.location + " " + (job.description || "")).toLowerCase();
                if (!text.includes(q)) return false;
            }

            // 2. Role filter: Tailored by default
            if (roleFilter !== "all") {
                const isMatch = job.roleFamily === roleFilter || (userRole ? isJobRoleMatch(job.roleFamily, job.title, userRole) : false);
                if (!isMatch) return false;
            }

            // 3. Location filter: Ensure remote jobs are hiring from user's region
            if (locationFilter !== "all") {
                const loc = job.location.toLowerCase();
                if (locationFilter === "nigeria") {
                    if (!loc.includes("nigeria") && !loc.includes("lagos") && !loc.includes("abuja")) return false;
                } else if (locationFilter === "africa") {
                    if (!loc.includes("africa") && !loc.includes("nigeria") && !loc.includes("kenya") && !loc.includes("ghana") && !loc.includes("south africa")) return false;
                } else if (locationFilter === "remote") {
                    if (userLocation) {
                        if (scoreJobForLocation(job.location, userLocation) === 0) return false;
                    } else {
                        if (!loc.includes("worldwide") && !loc.includes("global") && !loc.includes("anywhere")) return false;
                    }
                } else if (locationFilter === "us") {
                    if (!loc.includes("united states") && !loc.includes("san francisco") && !loc.includes("new york") && !loc.includes("usa")) return false;
                }
            } else if (userLocation) {
                // By default when browsing, filter out jobs not hiring in user's region
                if (scoreJobForLocation(job.location, userLocation) === 0) return false;
            }

            return true;
        });
    }, [jobs, loading, search, roleFilter, locationFilter, statusFilter, freshnessFilter, userRole, userLocation]);

    const handleOpenPayment = useCallback(() => setIsPaymentModalOpen(true), []);
    const handleClosePayment = useCallback(() => setIsPaymentModalOpen(false), []);
    const handleOpenJobDesc = useCallback((job: JobItem) => setSelectedJobDesc(job), []);
    const handleCloseJobDesc = useCallback(() => setSelectedJobDesc(null), []);

    return (
        <div style={{ minHeight: "100vh", background: "#F8FAFC", color: "#0F172A", fontFamily: "'Kumbh Sans', sans-serif" }}>
            {/* Top Navigation */}
            <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard")}
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#4782F6", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "13px", fontWeight: 600, fontFamily: "inherit" }}
                        title="Return to Dashboard"
                        aria-label="Back to Dashboard"
                    >
                        <ArrowLeft size={16} weight="bold" /> Back to Dashboard
                    </button>
                    <span style={{ color: "#CBD5E1" }}>|</span>
                    <span style={{ fontWeight: 700, fontSize: "16px", color: "#0F172A" }}>Explore Open Roles</span>
                </div>

                {userLocation && (
                    <div className={styles.locationBadgePill} style={{ cursor: "default" }}>
                        <Globe size={14} weight="bold" />
                        <span>Detected Location: {userLocation.country}</span>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
                {/* Page Title & Search Bar */}
                <div style={{ marginBottom: "1.75rem" }}>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0F172A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                        Global & Local Career Opportunities
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "#64748B", margin: 0 }}>
                        Curated roles across top Nigerian & African tech companies, global remote startups, and venture-backed platforms.
                    </p>
                </div>

                {/* Filter Controls Row */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "1.5rem", background: "#FFFFFF", padding: "12px 16px", borderRadius: "6px", border: "1px solid #E2E8F0" }}>
                    <div style={{ flex: "1 1 240px", position: "relative", minWidth: "200px" }}>
                        <MagnifyingGlass size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                        <input
                            type="text"
                            placeholder="Search by role title, company, skills..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: "100%", height: "38px", paddingLeft: "36px", paddingRight: "12px", borderRadius: "6px", border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: "13px", color: "#0F172A", outline: "none" }}
                        />
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="active">🟢 Active Only</option>
                            <option value="all">📋 All (incl. Closed)</option>
                            <option value="expired">⏳ Expired Only</option>
                        </select>

                        {/* Freshness Filter */}
                        <select
                            value={freshnessFilter}
                            onChange={(e) => setFreshnessFilter(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="all">⚡ Any Active Date (≤ 2 Weeks)</option>
                            <option value="7d">📅 Past 7 Days</option>
                            <option value="14d">📅 Past 14 Days (2 Weeks)</option>
                        </select>

                        {/* Location Filter */}
                        <select
                            value={locationFilter}
                            onChange={(e) => setLocationFilter(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="all">All Locations</option>
                            <option value="nigeria">Nigeria Only</option>
                            <option value="africa">Africa Region</option>
                            <option value="remote">Remote Worldwide</option>
                            <option value="us">United States</option>
                        </select>

                        {/* Role Filter */}
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            style={selectStyle}
                        >
                            <option value="all">💼 All Roles</option>
                            <option value="frontend_developer">Frontend Developer</option>
                            <option value="backend_engineer">Backend Engineer</option>
                            <option value="product_manager">Product Manager</option>
                            <option value="product_designer">Product Designer</option>
                            <option value="data_analyst">Data Analyst</option>
                        </select>
                    </div>
                </div>

                {/* Role Count Subheader with Tailored Indicator */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ fontSize: "13px", color: "#64748B", fontWeight: 500 }}>
                        {userRole && roleFilter !== "all" ? (
                            <span>
                                Showing <strong style={{ color: "#0F172A" }}>{filteredJobs.length}</strong> open position{filteredJobs.length === 1 ? "" : "s"} tailored for <strong style={{ color: "#4782F6" }}>{userRole}</strong>
                            </span>
                        ) : (
                            <span>Showing {filteredJobs.length} open position{filteredJobs.length === 1 ? "" : "s"}</span>
                        )}
                    </div>

                    {userRole && roleFilter !== "all" && (
                        <button
                            type="button"
                            onClick={() => setRoleFilter("all")}
                            style={{ background: "none", border: "none", color: "#4782F6", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}
                        >
                            Show all other roles →
                        </button>
                    )}
                </div>

                {/* Jobs Grid / List */}
                <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "6px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {filteredJobs.map((job, idx) => (
                            <JobRow
                                key={job.id || `${job.company}-${idx}`}
                                job={job}
                                isLast={idx === filteredJobs.length - 1}
                                onOpenDesc={handleOpenJobDesc}
                                onPractice={handleOpenPayment}
                            />
                        ))}

                        {filteredJobs.length === 0 && (
                            <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748B", fontSize: "14px" }}>
                                No job listings found matching your search and filter criteria.
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Job Description Modal */}
            {selectedJobDesc && (
                <JobDescModal
                    job={selectedJobDesc}
                    onClose={handleCloseJobDesc}
                    onPractice={() => {
                        setSelectedJobDesc(null);
                        setIsPaymentModalOpen(true);
                    }}
                    calibrationSectionTitle="Interview Preparation"
                    calibrationText={`Practice real-time technical and behavioral interview scenarios calibrated for ${selectedJobDesc.company}'s hiring standards with our AI Interview Coach and Recruiter.`}
                />
            )}

            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={handleClosePayment}
            />
        </div>
    );
}
