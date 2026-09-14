"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    SquaresFour,
    Briefcase,
    Question,
    Stack,
    Plus,
    MagnifyingGlass,
    ArrowsClockwise,
    PencilSimple,
    Trash,
    ArrowSquareOut,
    X,
    ArrowLeft,
    CheckCircle,
    Globe,
    LinkSimple,
    Database,
    ShieldCheck,
} from "@phosphor-icons/react";
import styles from "@/components/admin.module.css";
import type { RoleItem } from "@/app/api/roles/route";
import type { QuestionItem } from "@/app/api/questions/route";
import type { JobItem } from "@/app/api/jobs/route";
import type { ScraperSource } from "@/app/api/jobs/sources/route";

type AdminTab = "overview" | "roles" | "questions" | "jobs";
type JobsSubTab = "listings" | "sources";

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<AdminTab>("overview");
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Data states
    const [roles, setRoles] = useState<RoleItem[]>([]);
    const [questions, setQuestions] = useState<QuestionItem[]>([]);
    const [jobs, setJobs] = useState<JobItem[]>([]);

    const [loadingRoles, setLoadingRoles] = useState(false);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [scrapingSingleId, setScrapingSingleId] = useState<string | null>(null);
    const [validatingExpiry, setValidatingExpiry] = useState(false);

    // Scraper sources state
    const [sources, setSources] = useState<ScraperSource[]>([]);
    const [loadingSources, setLoadingSources] = useState(false);
    const [addSourceUrl, setAddSourceUrl] = useState("");
    const [addSourceName, setAddSourceName] = useState("");
    const [addSourceType, setAddSourceType] = useState<"career_page" | "vc_portfolio">("career_page");
    const [jobsSubTab, setJobsSubTab] = useState<JobsSubTab>("listings");
    const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);
    const [scrapeError, setScrapeError] = useState<string | null>(null);
    const [scrapeProgress, setScrapeProgress] = useState<{ current: number; total: number; currentSource: string; newJobs: number } | null>(null);

    // Filter states
    const [roleSearch, setRoleSearch] = useState("");
    const [roleDomainFilter, setRoleDomainFilter] = useState("all");

    const [questionSearch, setQuestionSearch] = useState("");
    const [questionRoleFamilyFilter, setQuestionRoleFamilyFilter] = useState("all");
    const [questionCategoryFilter, setQuestionCategoryFilter] = useState("all");

    const [jobSearch, setJobSearch] = useState("");
    const [jobRoleFamilyFilter, setJobRoleFamilyFilter] = useState("all");
    const [jobSourceFilter, setJobSourceFilter] = useState("all");
    const [jobStatusFilter, setJobStatusFilter] = useState("active");

    // Modal states
    const [roleModalOpen, setRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
    const [roleFormTitle, setRoleFormTitle] = useState("");
    const [roleFormDomain, setRoleFormDomain] = useState("Product & Design");
    const [isCustomDomain, setIsCustomDomain] = useState(false);
    const [customDomainText, setCustomDomainText] = useState("");

    const [questionModalOpen, setQuestionModalOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
    const [qFormRoleFamily, setQFormRoleFamily] = useState("product_manager");
    const [qFormCategory, setQFormCategory] = useState("product_sense");
    const [qFormQuestion, setQFormQuestion] = useState("");
    const [qFormSubType, setQFormSubType] = useState("all_roles");

    const [jobModalOpen, setJobModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<JobItem | null>(null);
    const [jFormTitle, setJFormTitle] = useState("");
    const [jFormCompany, setJFormCompany] = useState("");
    const [jFormLocation, setJFormLocation] = useState("");
    const [jFormRoleFamily, setJFormRoleFamily] = useState("product_manager");
    const [jFormUrl, setJFormUrl] = useState("");
    const [jFormType, setJFormType] = useState("Full-time");
    const [jFormSalary, setJFormSalary] = useState("");
    const [jFormStatus, setJFormStatus] = useState<"active" | "expired">("active");

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    // ── Data Fetchers ──
    const fetchRoles = async () => {
        setLoadingRoles(true);
        try {
            const res = await fetch("/api/roles");
            const data = await res.json();
            setRoles(data.roles || []);
        } catch {
            showToast("Failed to load roles.");
        } finally {
            setLoadingRoles(false);
        }
    };

    const fetchQuestions = async () => {
        setLoadingQuestions(true);
        try {
            const res = await fetch("/api/questions");
            const data = await res.json();
            setQuestions(data.questions || []);
        } catch {
            showToast("Failed to load questions.");
        } finally {
            setLoadingQuestions(false);
        }
    };

    const fetchJobs = async () => {
        setLoadingJobs(true);
        try {
            const res = await fetch("/api/jobs?status=all");
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch {
            showToast("Failed to load jobs.");
        } finally {
            setLoadingJobs(false);
        }
    };

    const fetchSources = async () => {
        setLoadingSources(true);
        try {
            const res = await fetch("/api/jobs/sources");
            const data = await res.json();
            setSources(data.sources || []);
        } catch {
            showToast("Failed to load scraper sources.");
        } finally {
            setLoadingSources(false);
        }
    };

    useEffect(() => {
        fetchRoles();
        fetchQuestions();
        fetchJobs();
        fetchSources();
    }, []);

    // ── Role Handlers ──
    const handleSaveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roleFormTitle.trim()) return;

        const domainToSave = isCustomDomain ? customDomainText.trim() : roleFormDomain.trim();
        if (!domainToSave) {
            showToast("Domain name cannot be empty.");
            return;
        }

        const isEdit = !!editingRole;
        const method = isEdit ? "PUT" : "POST";
        const payload = isEdit
            ? { id: editingRole.id, title: roleFormTitle, domain: domainToSave }
            : { title: roleFormTitle, domain: domainToSave };

        try {
            const res = await fetch("/api/roles", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast(isEdit ? "Role updated successfully." : "New role added successfully.");
                setRoleModalOpen(false);
                fetchRoles();
            } else {
                showToast("Error saving role.");
            }
        } catch {
            showToast("Failed to connect to server.");
        }
    };

    const handleDeleteRole = async (id: string) => {
        if (!confirm("Are you sure you want to delete this role?")) return;
        try {
            const res = await fetch(`/api/roles?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Role deleted.");
                fetchRoles();
            }
        } catch {
            showToast("Failed to delete role.");
        }
    };

    const openAddRoleModal = () => {
        setEditingRole(null);
        setRoleFormTitle("");
        setRoleFormDomain(roles[0]?.domain || "Product & Design");
        setIsCustomDomain(false);
        setCustomDomainText("");
        setRoleModalOpen(true);
    };

    const openEditRoleModal = (role: RoleItem) => {
        setEditingRole(role);
        setRoleFormTitle(role.title);
        setRoleFormDomain(role.domain);
        setIsCustomDomain(false);
        setCustomDomainText("");
        setRoleModalOpen(true);
    };

    // ── Question Handlers ──
    const handleSaveQuestion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!qFormQuestion.trim()) return;

        const isEdit = !!editingQuestion;
        const method = isEdit ? "PUT" : "POST";
        const payload = isEdit
            ? {
                  id: editingQuestion.id,
                  role_family: qFormRoleFamily,
                  category: qFormCategory,
                  question: qFormQuestion,
                  sub_type: qFormSubType,
              }
            : {
                  role_family: qFormRoleFamily,
                  category: qFormCategory,
                  question: qFormQuestion,
                  sub_type: qFormSubType,
              };

        try {
            const res = await fetch("/api/questions", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast(isEdit ? "Question updated." : "New question added to bank.");
                setQuestionModalOpen(false);
                fetchQuestions();
            } else {
                showToast("Error saving question.");
            }
        } catch {
            showToast("Failed to save question.");
        }
    };

    const handleDeleteQuestion = async (id: string) => {
        if (!confirm("Delete this question from the question bank?")) return;
        try {
            const res = await fetch(`/api/questions?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Question removed.");
                fetchQuestions();
            }
        } catch {
            showToast("Failed to delete question.");
        }
    };

    const openAddQuestionModal = () => {
        setEditingQuestion(null);
        setQFormRoleFamily("product_manager");
        setQFormCategory("product_sense");
        setQFormQuestion("");
        setQFormSubType("all_roles");
        setQuestionModalOpen(true);
    };

    const openEditQuestionModal = (q: QuestionItem) => {
        setEditingQuestion(q);
        setQFormRoleFamily(q.role_family);
        setQFormCategory(q.category);
        setQFormQuestion(q.question);
        setQFormSubType(q.sub_type || "all_roles");
        setQuestionModalOpen(true);
    };

    // ── Job Handlers ──
    const handleSaveJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!jFormTitle.trim() || !jFormCompany.trim()) return;

        const isEdit = !!editingJob;
        const method = isEdit ? "PUT" : "POST";
        const payload = isEdit
            ? {
                  id: editingJob.id,
                  title: jFormTitle,
                  company: jFormCompany,
                  location: jFormLocation,
                  roleFamily: jFormRoleFamily,
                  url: jFormUrl,
                  employmentType: jFormType,
                  salaryRange: jFormSalary,
                  status: jFormStatus,
              }
            : {
                  title: jFormTitle,
                  company: jFormCompany,
                  location: jFormLocation,
                  roleFamily: jFormRoleFamily,
                  url: jFormUrl,
                  employmentType: jFormType,
                  salaryRange: jFormSalary,
                  status: jFormStatus,
              };

        try {
            const res = await fetch("/api/jobs", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast(isEdit ? "Job posting updated." : "New job opportunity added.");
                setJobModalOpen(false);
                fetchJobs();
            } else {
                showToast("Error saving job posting.");
            }
        } catch {
            showToast("Failed to save job.");
        }
    };

    const handleToggleJobStatus = async (job: JobItem) => {
        const newStatus = (job.status || "active") === "active" ? "expired" : "active";
        try {
            const res = await fetch("/api/jobs", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...job, status: newStatus }),
            });
            if (res.ok) {
                showToast(`Job marked as ${newStatus}.`);
                fetchJobs();
            }
        } catch {
            showToast("Failed to update status.");
        }
    };

    const handlePurgeExpiredJobs = async () => {
        if (!confirm("Permanently delete all expired job postings?")) return;
        try {
            const res = await fetch("/api/jobs?purgeExpired=true", { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || "Expired jobs purged.");
                fetchJobs();
            } else {
                showToast("Failed to purge expired jobs.");
            }
        } catch {
            showToast("Failed to connect to server.");
        }
    };

    const handleValidateExpiry = async () => {
        setValidatingExpiry(true);
        try {
            const res = await fetch("/api/jobs/validate-expiry", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || `Checked ${data.checkedCount} roles.`);
                fetchJobs();
            } else {
                showToast(data.error || "Failed to validate expiry.");
            }
        } catch {
            showToast("Server error during validation.");
        } finally {
            setValidatingExpiry(false);
        }
    };

    const handleDeleteJob = async (id: string) => {
        if (!confirm("Delete this job listing?")) return;
        try {
            const res = await fetch(`/api/jobs?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Job opportunity deleted.");
                fetchJobs();
            }
        } catch {
            showToast("Failed to delete job.");
        }
    };

    const handleRunScraper = async () => {
        const enabledSources = sources.filter((s) => s.enabled);
        if (enabledSources.length === 0) {
            showToast("No active scraper sources found.");
            return;
        }

        setScraping(true);
        setScrapeMessage(null);
        setScrapeError(null);
        let totalNew = 0;
        let totalFound = 0;

        try {
            for (let i = 0; i < enabledSources.length; i++) {
                const src = enabledSources[i];
                setScrapeProgress({
                    current: i + 1,
                    total: enabledSources.length,
                    currentSource: src.companyName,
                    newJobs: totalNew,
                });

                try {
                    const res = await fetch(`/api/jobs/scrape?sourceId=${src.id}`, { method: "POST" });
                    if (res.ok) {
                        const data = await res.json();
                        totalNew += (data.scrapedCount || 0);
                        totalFound += (data.totalJobsFound || 0);
                    }
                } catch {
                    // Continue to next source gracefully
                }
            }

            const msg = `Scraped ${enabledSources.length} sources: found ${totalFound} total jobs, ${totalNew} new roles added.`;
            setScrapeMessage(msg);
            showToast(msg);
            fetchJobs();
            fetchSources();
        } catch {
            setScrapeError("Scraper encountered an issue.");
            showToast("Failed to complete full scrape.");
        } finally {
            setScraping(false);
            setScrapeProgress(null);
        }
    };

    const handleScrapeSingle = async (sourceId: string) => {
        setScrapingSingleId(sourceId);
        try {
            const res = await fetch(`/api/jobs/scrape?sourceId=${sourceId}`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || "Source scraped!");
                fetchJobs();
                fetchSources();
            } else {
                showToast(data.error || "Failed to scrape source.");
            }
        } catch {
            showToast("Failed to scrape this source.");
        } finally {
            setScrapingSingleId(null);
        }
    };

    const handleAddSource = async () => {
        if (!addSourceUrl.trim()) {
            showToast("Please enter a career page URL.");
            return;
        }
        try {
            const res = await fetch("/api/jobs/sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: addSourceUrl.trim(),
                    companyName: addSourceName.trim() || undefined,
                    sourceType: addSourceType,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Added "${data.source.companyName}" to scraper sources.`);
                setAddSourceUrl("");
                setAddSourceName("");
                fetchSources();
            } else {
                showToast(data.error || "Failed to add source.");
            }
        } catch {
            showToast("Failed to add source.");
        }
    };

    const handleToggleSource = async (source: ScraperSource) => {
        try {
            const res = await fetch("/api/jobs/sources", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: source.id, enabled: !source.enabled }),
            });
            if (res.ok) {
                fetchSources();
            } else {
                showToast("Failed to update source.");
            }
        } catch {
            showToast("Failed to update source.");
        }
    };

    const handleDeleteSource = async (id: string) => {
        if (!confirm("Remove this scraper source?")) return;
        try {
            const res = await fetch(`/api/jobs/sources?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Source removed.");
                fetchSources();
            }
        } catch {
            showToast("Failed to delete source.");
        }
    };

    const openAddJobModal = () => {
        setEditingJob(null);
        setJFormTitle("");
        setJFormCompany("");
        setJFormLocation("Remote");
        setJFormRoleFamily("product_manager");
        setJFormUrl("");
        setJFormType("Full-time");
        setJFormSalary("");
        setJFormStatus("active");
        setJobModalOpen(true);
    };

    const openEditJobModal = (job: JobItem) => {
        setEditingJob(job);
        setJFormTitle(job.title);
        setJFormCompany(job.company);
        setJFormLocation(job.location);
        setJFormRoleFamily(job.roleFamily);
        setJFormUrl(job.url);
        setJFormType(job.employmentType);
        setJFormSalary(job.salaryRange || "");
        setJFormStatus(job.status || "active");
        setJobModalOpen(true);
    };

    // Filter calculations
    const filteredRoles = useMemo(() => roles.filter((r) => {
        const matchesSearch = r.title.toLowerCase().includes(roleSearch.toLowerCase());
        const matchesDomain = roleDomainFilter === "all" || r.domain === roleDomainFilter;
        return matchesSearch && matchesDomain;
    }), [roles, roleSearch, roleDomainFilter]);

    const filteredQuestions = useMemo(() => questions.filter((q) => {
        const matchesSearch =
            q.question.toLowerCase().includes(questionSearch.toLowerCase()) ||
            q.role_family.toLowerCase().includes(questionSearch.toLowerCase());
        const matchesRoleFam = questionRoleFamilyFilter === "all" || q.role_family === questionRoleFamilyFilter;
        const matchesCat = questionCategoryFilter === "all" || q.category === questionCategoryFilter;
        return matchesSearch && matchesRoleFam && matchesCat;
    }), [questions, questionSearch, questionRoleFamilyFilter, questionCategoryFilter]);

    const filteredJobs = useMemo(() => jobs.filter((j) => {
        const matchesSearch =
            j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
            j.company.toLowerCase().includes(jobSearch.toLowerCase()) ||
            j.location.toLowerCase().includes(jobSearch.toLowerCase());
        const matchesRoleFam = jobRoleFamilyFilter === "all" || j.roleFamily === jobRoleFamilyFilter;
        const matchesSource = jobSourceFilter === "all" || j.source === jobSourceFilter;
        const matchesStatus = jobStatusFilter === "all" || (j.status || "active") === jobStatusFilter;
        return matchesSearch && matchesRoleFam && matchesSource && matchesStatus;
    }), [jobs, jobSearch, jobRoleFamilyFilter, jobSourceFilter, jobStatusFilter]);

    const uniqueDomains = useMemo(() => Array.from(new Set(roles.map((r) => r.domain))), [roles]);
    const uniqueRoleFamilies = useMemo(() => Array.from(new Set(questions.map((q) => q.role_family))), [questions]);
    const uniqueCategories = useMemo(() => Array.from(new Set(questions.map((q) => q.category))), [questions]);

    return (
        <div className={styles.adminPage}>
            {/* Top Navigation Header */}
            <header className={styles.adminNav}>
                <div className={styles.brandWrap}>
                    <Image
                        src="/useladder_logo.png"
                        alt="useladder"
                        width={110}
                        height={24}
                        className={styles.brandLogo}
                    />
                    <span className={styles.adminBadge}>Admin Portal</span>
                </div>

                <div className={styles.navRight}>
                    <Link href="/dashboard" className={styles.backHomeBtn}>
                        <ArrowLeft size={14} /> Back to App
                    </Link>
                </div>
            </header>

            {/* Main Content Area */}
            <main className={styles.adminContainer}>
                {/* Page Title Header */}
                <div className={styles.pageHeader}>
                    <div>
                        <h1 className={styles.pageTitle}>Platform Administration</h1>
                        <p className={styles.pageSub}>
                            Manage interview roles, question bank items, and job opportunities in real-time.
                        </p>
                    </div>
                </div>

                {/* Tabs Row */}
                <div className={styles.tabsRow}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === "overview" ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab("overview")}
                    >
                        <SquaresFour size={16} /> Overview
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === "roles" ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab("roles")}
                    >
                        <Stack size={16} /> Roles ({roles.length})
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === "questions" ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab("questions")}
                    >
                        <Question size={16} /> Question Bank ({questions.length})
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === "jobs" ? styles.tabBtnActive : ""}`}
                        onClick={() => setActiveTab("jobs")}
                    >
                        <Briefcase size={16} /> Job Opportunities ({jobs.length})
                    </button>
                </div>

                {/* ════════ TAB 1: OVERVIEW ════════ */}
                {activeTab === "overview" && (
                    <div>
                        <div className={styles.statsGrid}>
                            <div className={styles.statCard}>
                                <div className={styles.statInfo}>
                                    <span className={styles.statNumber}>{roles.length}</span>
                                    <span className={styles.statLabel}>Available Roles</span>
                                </div>
                                <div className={styles.statIconWrap}>
                                    <Stack size={22} />
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={styles.statInfo}>
                                    <span className={styles.statNumber}>{questions.length}</span>
                                    <span className={styles.statLabel}>Bank Questions</span>
                                </div>
                                <div className={styles.statIconWrap}>
                                    <Question size={22} />
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={styles.statInfo}>
                                    <span className={styles.statNumber}>{jobs.length}</span>
                                    <span className={styles.statLabel}>Job Listings</span>
                                </div>
                                <div className={styles.statIconWrap}>
                                    <Briefcase size={22} />
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={styles.statInfo}>
                                    <span className={styles.statNumber}>{sources.filter(s => s.enabled).length}</span>
                                    <span className={styles.statLabel}>Active Sources</span>
                                </div>
                                <div className={styles.statIconWrap} style={{ color: "#166534", background: "#DCFCE7" }}>
                                    <Globe size={22} />
                                </div>
                            </div>
                        </div>

                        <div className={styles.actionRow} style={{ marginTop: "1rem" }}>
                            <button type="button" className={styles.primaryBtn} onClick={openAddRoleModal}>
                                <Plus size={16} /> Add Role
                            </button>
                            <button type="button" className={styles.primaryBtn} onClick={openAddQuestionModal}>
                                <Plus size={16} /> Add Question
                            </button>
                            <button type="button" className={styles.primaryBtn} onClick={openAddJobModal}>
                                <Plus size={16} /> Add Job Opportunity
                            </button>
                            <button type="button" className={styles.scrapeBtn} onClick={handleRunScraper} disabled={scraping}>
                                <ArrowsClockwise size={16} className={scraping ? "animate-spin" : ""} />
                                {scraping ? "Scraping..." : "Scrape All Sources"}
                            </button>
                        </div>
                    </div>
                )}

                {/* ════════ TAB 2: ROLES ════════ */}
                {activeTab === "roles" && (
                    <div>
                        <div className={styles.actionRow}>
                            <div className={styles.searchFilterGroup}>
                                <div className={styles.searchInputWrap}>
                                    <MagnifyingGlass size={16} className={styles.searchIcon} />
                                    <input
                                        type="text"
                                        placeholder="Search roles..."
                                        className={styles.searchInput}
                                        value={roleSearch}
                                        onChange={(e) => setRoleSearch(e.target.value)}
                                    />
                                </div>

                                <select
                                    className={styles.filterSelect}
                                    value={roleDomainFilter}
                                    onChange={(e) => setRoleDomainFilter(e.target.value)}
                                >
                                    <option value="all">All Domains</option>
                                    {uniqueDomains.map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="button" className={styles.primaryBtn} onClick={openAddRoleModal}>
                                <Plus size={16} /> Add New Role
                            </button>
                        </div>

                        <div className={styles.tableCard}>
                            <div className={styles.tableWrap}>
                                <table className={styles.adminTable}>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Role Title</th>
                                            <th>Domain</th>
                                            <th style={{ textAlign: "right" }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRoles.map((role) => (
                                            <tr key={role.id}>
                                                <td style={{ fontFamily: "monospace", color: "#64748B" }}>{role.id}</td>
                                                <td style={{ fontWeight: 600 }}>{role.title}</td>
                                                <td>
                                                    <span className={styles.badgeDomain}>{role.domain}</span>
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                    <div style={{ display: "inline-flex", gap: "8px" }}>
                                                        <button
                                                            type="button"
                                                            className={styles.secondaryBtn}
                                                            onClick={() => openEditRoleModal(role)}
                                                        >
                                                            <PencilSimple size={13} /> Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.dangerBtn}
                                                            onClick={() => handleDeleteRole(role.id)}
                                                        >
                                                            <Trash size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredRoles.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className={styles.emptyState}>
                                                    No roles matching filter criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════ TAB 3: QUESTION BANK ════════ */}
                {activeTab === "questions" && (
                    <div>
                        <div className={styles.actionRow}>
                            <div className={styles.searchFilterGroup}>
                                <div className={styles.searchInputWrap}>
                                    <MagnifyingGlass size={16} className={styles.searchIcon} />
                                    <input
                                        type="text"
                                        placeholder="Search question prompt or family..."
                                        className={styles.searchInput}
                                        value={questionSearch}
                                        onChange={(e) => setQuestionSearch(e.target.value)}
                                    />
                                </div>

                                <select
                                    className={styles.filterSelect}
                                    value={questionRoleFamilyFilter}
                                    onChange={(e) => setQuestionRoleFamilyFilter(e.target.value)}
                                >
                                    <option value="all">All Role Families</option>
                                    {uniqueRoleFamilies.map((rf) => (
                                        <option key={rf} value={rf}>{rf}</option>
                                    ))}
                                </select>

                                <select
                                    className={styles.filterSelect}
                                    value={questionCategoryFilter}
                                    onChange={(e) => setQuestionCategoryFilter(e.target.value)}
                                >
                                    <option value="all">All Categories</option>
                                    {uniqueCategories.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="button" className={styles.primaryBtn} onClick={openAddQuestionModal}>
                                <Plus size={16} /> Add Question
                            </button>
                        </div>

                        <div className={styles.tableCard}>
                            <div className={styles.tableWrap}>
                                <table className={styles.adminTable}>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Role Family</th>
                                            <th>Category</th>
                                            <th>Question Prompt</th>
                                            <th style={{ textAlign: "right" }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredQuestions.map((q) => (
                                            <tr key={q.id}>
                                                <td style={{ fontFamily: "monospace", color: "#64748B", fontSize: "12px" }}>{q.id}</td>
                                                <td>
                                                    <span className={styles.badgeDomain}>{q.role_family}</span>
                                                </td>
                                                <td>
                                                    <span className={styles.badgeCategory}>{q.category}</span>
                                                </td>
                                                <td style={{ maxWidth: "440px", lineHeight: "1.4" }}>{q.question}</td>
                                                <td style={{ textAlign: "right" }}>
                                                    <div style={{ display: "inline-flex", gap: "8px" }}>
                                                        <button
                                                            type="button"
                                                            className={styles.secondaryBtn}
                                                            onClick={() => openEditQuestionModal(q)}
                                                        >
                                                            <PencilSimple size={13} /> Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.dangerBtn}
                                                            onClick={() => handleDeleteQuestion(q.id)}
                                                        >
                                                            <Trash size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredQuestions.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className={styles.emptyState}>
                                                    No questions matching filter criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════ TAB 4: JOB OPPORTUNITIES ════════ */}
                {activeTab === "jobs" && (
                    <div>
                        {/* Sub-tab navigation: Listings vs Sources */}
                        <div className={styles.subTabRow}>
                            <button
                                type="button"
                                className={`${styles.subTabBtn} ${jobsSubTab === "listings" ? styles.subTabBtnActive : ""}`}
                                onClick={() => setJobsSubTab("listings")}
                            >
                                <Briefcase size={14} /> Job Listings ({jobs.length})
                            </button>
                            <button
                                type="button"
                                className={`${styles.subTabBtn} ${jobsSubTab === "sources" ? styles.subTabBtnActive : ""}`}
                                onClick={() => setJobsSubTab("sources")}
                            >
                                <Globe size={14} /> Scraper Sources ({sources.length})
                            </button>
                        </div>

                        {/* ── Sub-tab: Job Listings ── */}
                        {jobsSubTab === "listings" && (
                            <>
                                <div className={styles.actionRow}>
                                    <div className={styles.searchFilterGroup}>
                                        <div className={styles.searchInputWrap}>
                                            <MagnifyingGlass size={16} className={styles.searchIcon} />
                                            <input
                                                type="text"
                                                placeholder="Search title, company, location..."
                                                className={styles.searchInput}
                                                value={jobSearch}
                                                onChange={(e) => setJobSearch(e.target.value)}
                                            />
                                        </div>

                                        <select
                                            className={styles.filterSelect}
                                            value={jobStatusFilter}
                                            onChange={(e) => setJobStatusFilter(e.target.value)}
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="active">🟢 Active Only</option>
                                            <option value="expired">⏳ Expired Only</option>
                                        </select>

                                        <select
                                            className={styles.filterSelect}
                                            value={jobSourceFilter}
                                            onChange={(e) => setJobSourceFilter(e.target.value)}
                                        >
                                            <option value="all">All Sources</option>
                                            <option value="manual">Manual Entry</option>
                                            <option value="scraped">Automated Scraped</option>
                                        </select>

                                        <select
                                            className={styles.filterSelect}
                                            value={jobRoleFamilyFilter}
                                            onChange={(e) => setJobRoleFamilyFilter(e.target.value)}
                                        >
                                            <option value="all">All Role Families</option>
                                            <option value="product_manager">Product Manager</option>
                                            <option value="product_designer">Product Designer</option>
                                            <option value="frontend_developer">Frontend Developer</option>
                                            <option value="backend_engineer">Backend Engineer</option>
                                        </select>
                                    </div>

                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={handleValidateExpiry}
                                            disabled={validatingExpiry}
                                            title="Perform live URL health checks and soft-404 detection across active job postings"
                                        >
                                            <ShieldCheck size={15} />
                                            {validatingExpiry ? "Validating Live Status..." : "Auto-Detect Expired Roles"}
                                        </button>
                                        <button type="button" className={styles.secondaryBtn} onClick={handlePurgeExpiredJobs} title="Purge all expired job postings">
                                            <Trash size={14} /> Purge Expired
                                        </button>
                                        <button type="button" className={styles.scrapeBtn} onClick={handleRunScraper} disabled={scraping}>
                                            <ArrowsClockwise size={15} className={scraping ? "animate-spin" : ""} />
                                            {scraping ? "Scraping..." : "Scrape All Sources"}
                                        </button>
                                        <button type="button" className={styles.primaryBtn} onClick={openAddJobModal}>
                                            <Plus size={16} /> Add Job Opportunity
                                        </button>
                                    </div>
                                </div>

                                {scrapeProgress && (
                                    <div className={styles.scrapeProgressBarWrap}>
                                        <div className={styles.scrapeProgressHeader}>
                                            <span>
                                                Scraping [{scrapeProgress.current}/{scrapeProgress.total}]: <strong>{scrapeProgress.currentSource}</strong>
                                            </span>
                                            <span>{Math.round((scrapeProgress.current / scrapeProgress.total) * 100)}%</span>
                                        </div>
                                        <div className={styles.scrapeProgressTrack}>
                                            <div
                                                className={styles.scrapeProgressBar}
                                                style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {scrapeMessage && (
                                    <div className={styles.scrapeResultsSummary}>
                                        <CheckCircle size={16} weight="fill" /> {scrapeMessage}
                                    </div>
                                )}

                                <div className={styles.tableCard}>
                                    <div className={styles.tableWrap}>
                                        <table className={styles.adminTable}>
                                            <thead>
                                                <tr>
                                                    <th>Job Title & Company</th>
                                                    <th>Location</th>
                                                    <th>Role Family</th>
                                                    <th>Status</th>
                                                    <th>Source</th>
                                                    <th>Salary Range</th>
                                                    <th>Date Posted</th>
                                                    <th style={{ textAlign: "right" }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredJobs.map((j) => (
                                                    <tr key={j.id} style={{ opacity: (j.status || "active") === "expired" ? 0.6 : 1 }}>
                                                        <td>
                                                             <div style={{ fontWeight: 600 }}>{j.title}</div>
                                                            <div style={{ fontSize: "12px", color: "#64748B" }}>{j.company}</div>
                                                        </td>
                                                        <td>{j.location}</td>
                                                        <td>
                                                            <span className={styles.badgeDomain}>{j.roleFamily}</span>
                                                        </td>
                                                        <td>
                                                            {(j.status || "active") === "active" ? (
                                                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", background: "#ECFDF5", color: "#059669", fontSize: "11px", fontWeight: 600 }}>
                                                                    Active
                                                                </span>
                                                            ) : (
                                                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", background: "#FEF2F2", color: "#DC2626", fontSize: "11px", fontWeight: 600 }}>
                                                                    Expired
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {j.source === "scraped" ? (
                                                                <span className={styles.badgeScraped}>Scraped</span>
                                                            ) : (
                                                                <span className={styles.badgeManual}>Manual</span>
                                                            )}
                                                        </td>
                                                        <td>{j.salaryRange || "Competitive"}</td>
                                                        <td style={{ fontSize: "12px", color: "#64748B" }}>{j.datePosted}</td>
                                                        <td style={{ textAlign: "right" }}>
                                                            <div style={{ display: "inline-flex", gap: "6px" }}>
                                                                {j.url && j.url !== "#" && (
                                                                    <a
                                                                        href={j.url}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className={styles.secondaryBtn}
                                                                        style={{ textDecoration: "none" }}
                                                                    >
                                                                        <ArrowSquareOut size={13} />
                                                                    </a>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    className={styles.secondaryBtn}
                                                                    title={(j.status || "active") === "active" ? "Mark as expired" : "Reactivate role"}
                                                                    onClick={() => handleToggleJobStatus(j)}
                                                                >
                                                                    {(j.status || "active") === "active" ? "⏳ Expire" : "🟢 Activate"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={styles.secondaryBtn}
                                                                    onClick={() => openEditJobModal(j)}
                                                                >
                                                                    <PencilSimple size={13} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={styles.dangerBtn}
                                                                    onClick={() => handleDeleteJob(j.id)}
                                                                >
                                                                    <Trash size={13} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {filteredJobs.length === 0 && (
                                                    <tr>
                                                        <td colSpan={8} className={styles.emptyState}>
                                                            No job listings matching filter criteria.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── Sub-tab: Scraper Sources ── */}
                        {jobsSubTab === "sources" && (
                            <>
                                <div className={styles.sourcesSectionHeader}>
                                    <h3 className={styles.sourcesSectionTitle}>
                                        <Database size={18} /> Career Page Sources
                                        <span className={styles.sourcesCount}>{sources.filter(s => s.enabled).length} active</span>
                                    </h3>
                                    <button type="button" className={styles.scrapeBtn} onClick={handleRunScraper} disabled={scraping}>
                                        <ArrowsClockwise size={15} className={scraping ? "animate-spin" : ""} />
                                        {scraping ? "Scraping All..." : "Scrape All Sources"}
                                    </button>
                                </div>

                                {/* Add source form */}
                                <div className={styles.addSourceRow}>
                                    <input
                                        type="url"
                                        className={styles.inputField}
                                        placeholder="https://boards.greenhouse.io/company or career page URL..."
                                        value={addSourceUrl}
                                        onChange={(e) => setAddSourceUrl(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleAddSource(); }}
                                    />
                                    <input
                                        type="text"
                                        className={styles.inputField}
                                        placeholder="Company name (optional)"
                                        value={addSourceName}
                                        onChange={(e) => setAddSourceName(e.target.value)}
                                        style={{ flex: "0 0 180px" }}
                                    />
                                    <select
                                        className={styles.inputField}
                                        value={addSourceType}
                                        onChange={(e) => setAddSourceType(e.target.value as "career_page" | "vc_portfolio")}
                                        style={{ flex: "0 0 150px" }}
                                    >
                                        <option value="career_page">Career Page</option>
                                        <option value="vc_portfolio">VC Portfolio</option>
                                    </select>
                                    <button type="button" className={styles.primaryBtn} onClick={handleAddSource}>
                                        <Plus size={14} /> Add
                                    </button>
                                </div>

                                {scrapeProgress && (
                                    <div className={styles.scrapeProgressBarWrap}>
                                        <div className={styles.scrapeProgressHeader}>
                                            <span>
                                                Scraping [{scrapeProgress.current}/{scrapeProgress.total}]: <strong>{scrapeProgress.currentSource}</strong>
                                            </span>
                                            <span>{Math.round((scrapeProgress.current / scrapeProgress.total) * 100)}%</span>
                                        </div>
                                        <div className={styles.scrapeProgressTrack}>
                                            <div
                                                className={styles.scrapeProgressBar}
                                                style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {scrapeMessage && (
                                    <div className={styles.scrapeResultsSummary}>
                                        <CheckCircle size={16} weight="fill" /> {scrapeMessage}
                                    </div>
                                )}
                                {scrapeError && (
                                    <div className={styles.scrapeResultsError}>
                                        {scrapeError}
                                    </div>
                                )}

                                {/* Sources table */}
                                <div className={styles.tableCard}>
                                    <div className={styles.tableWrap}>
                                        <table className={styles.adminTable}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: "40px" }}>On</th>
                                                    <th>Company / Source</th>
                                                    <th>URL</th>
                                                    <th>Type</th>
                                                    <th>Provider</th>
                                                    <th>Last Scraped</th>
                                                    <th>Jobs</th>
                                                    <th style={{ textAlign: "right" }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sources.map((src) => (
                                                    <tr key={src.id}>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className={`${styles.toggleSwitch} ${src.enabled ? styles.toggleActive : ""}`}
                                                                onClick={() => handleToggleSource(src)}
                                                                title={src.enabled ? "Disable" : "Enable"}
                                                            />
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600, fontSize: "13px" }}>{src.companyName}</div>
                                                        </td>
                                                        <td>
                                                            <div className={styles.sourceUrl}>
                                                                <a href={src.url} target="_blank" rel="noreferrer" title={src.url}>
                                                                    <LinkSimple size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                                                                    {src.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 45)}{src.url.length > 55 ? "..." : ""}
                                                                </a>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {src.sourceType === "vc_portfolio" ? (
                                                                <span className={styles.badgeVcPortfolio}>VC Portfolio</span>
                                                            ) : (
                                                                <span className={styles.badgeCareerPage}>Career Page</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className={styles.badgeAts}>{src.atsProvider}</span>
                                                        </td>
                                                        <td>
                                                            {src.lastScraped ? (
                                                                <span className={styles.lastScrapedText}>
                                                                    {new Date(src.lastScraped).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                </span>
                                                            ) : (
                                                                <span className={styles.lastScrapedText}>Never</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className={styles.jobsFoundBadge}>{src.lastJobCount}</span>
                                                        </td>
                                                        <td style={{ textAlign: "right" }}>
                                                            <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                                                                <button
                                                                    type="button"
                                                                    className={styles.scrapeOneBtn}
                                                                    onClick={() => handleScrapeSingle(src.id)}
                                                                    disabled={scrapingSingleId === src.id}
                                                                >
                                                                    <ArrowsClockwise size={12} />
                                                                    {scrapingSingleId === src.id ? "..." : "Scrape"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={styles.dangerBtn}
                                                                    onClick={() => handleDeleteSource(src.id)}
                                                                >
                                                                    <Trash size={13} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {sources.length === 0 && (
                                                    <tr>
                                                        <td colSpan={8} className={styles.emptyState}>
                                                            {loadingSources ? "Loading sources..." : "No scraper sources configured. Add a career page URL above."}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </main>

            {/* ════════ ROLE MODAL ════════ */}
            {roleModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modalBox}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{editingRole ? "Edit Role" : "Add New Role"}</h3>
                            <button type="button" className={styles.closeBtn} onClick={() => setRoleModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveRole}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Role Title</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. Senior Frontend Architect"
                                        value={roleFormTitle}
                                        onChange={(e) => setRoleFormTitle(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                        <label className={styles.formLabel}>Domain</label>
                                        <button
                                            type="button"
                                            style={{ background: "none", border: "none", color: "#4782F6", fontSize: "12px", cursor: "pointer", fontWeight: 500 }}
                                            onClick={() => {
                                                setIsCustomDomain(!isCustomDomain);
                                                if (!isCustomDomain) setCustomDomainText("");
                                            }}
                                        >
                                            {isCustomDomain ? "← Select Existing Domain" : "+ Create New Domain"}
                                        </button>
                                    </div>

                                    {isCustomDomain ? (
                                        <input
                                            type="text"
                                            required
                                            className={styles.inputField}
                                            placeholder="Enter new domain name (e.g. AI & Robotics)"
                                            value={customDomainText}
                                            onChange={(e) => setCustomDomainText(e.target.value)}
                                        />
                                    ) : (
                                        <select
                                            className={styles.inputField}
                                            value={roleFormDomain}
                                            onChange={(e) => setRoleFormDomain(e.target.value)}
                                        >
                                            {uniqueDomains.map((d) => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryBtn} onClick={() => setRoleModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.primaryBtn}>
                                    Save Role
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ════════ QUESTION MODAL ════════ */}
            {questionModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modalBox}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{editingQuestion ? "Edit Question" : "Add Question to Bank"}</h3>
                            <button type="button" className={styles.closeBtn} onClick={() => setQuestionModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveQuestion}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Role Family</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. product_manager, general, frontend_developer"
                                        value={qFormRoleFamily}
                                        onChange={(e) => setQFormRoleFamily(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Category</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. product_sense, leadership_execution, system_design"
                                        value={qFormCategory}
                                        onChange={(e) => setQFormCategory(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Question Prompt</label>
                                    <textarea
                                        required
                                        className={styles.textAreaField}
                                        placeholder="Enter the complete question prompt..."
                                        value={qFormQuestion}
                                        onChange={(e) => setQFormQuestion(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryBtn} onClick={() => setQuestionModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.primaryBtn}>
                                    Save Question
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ════════ JOB MODAL ════════ */}
            {jobModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modalBox}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{editingJob ? "Edit Job Posting" : "Add Job Opportunity"}</h3>
                            <button type="button" className={styles.closeBtn} onClick={() => setJobModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveJob}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Job Title</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. Senior Product Manager"
                                        value={jFormTitle}
                                        onChange={(e) => setJFormTitle(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Company Name</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. UseLadder AI"
                                        value={jFormCompany}
                                        onChange={(e) => setJFormCompany(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Location</label>
                                    <input
                                        type="text"
                                        required
                                        className={styles.inputField}
                                        placeholder="e.g. Remote, San Francisco, CA"
                                        value={jFormLocation}
                                        onChange={(e) => setJFormLocation(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Role Family</label>
                                    <select
                                        className={styles.inputField}
                                        value={jFormRoleFamily}
                                        onChange={(e) => setJFormRoleFamily(e.target.value)}
                                    >
                                        <option value="product_manager">product_manager</option>
                                        <option value="product_designer">product_designer</option>
                                        <option value="frontend_developer">frontend_developer</option>
                                        <option value="backend_engineer">backend_engineer</option>
                                        <option value="general">general</option>
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Job Application URL</label>
                                    <input
                                        type="url"
                                        className={styles.inputField}
                                        placeholder="https://..."
                                        value={jFormUrl}
                                        onChange={(e) => setJFormUrl(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Salary Range</label>
                                    <input
                                        type="text"
                                        className={styles.inputField}
                                        placeholder="e.g. $140,000 - $180,000"
                                        value={jFormSalary}
                                        onChange={(e) => setJFormSalary(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Status</label>
                                    <select
                                        className={styles.inputField}
                                        value={jFormStatus}
                                        onChange={(e) => setJFormStatus(e.target.value as "active" | "expired")}
                                    >
                                        <option value="active">🟢 Active</option>
                                        <option value="expired">⏳ Expired</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.secondaryBtn} onClick={() => setJobModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className={styles.primaryBtn}>
                                    Save Opportunity
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Notification Toast */}
            {toastMessage && <div className={styles.toast}>{toastMessage}</div>}
        </div>
    );
}
