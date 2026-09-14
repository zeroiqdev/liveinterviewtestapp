"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./payment.module.css";

interface ResumeEntry {
    id: string;
    name: string;
    data: string; // base64
    createdAt: string;
}

interface UserProfile {
    email?: string;
    name?: string;
    domain?: string;
    role?: string;
    seniority?: string;
    resume?: string; // legacy single resume
    resumes?: ResumeEntry[]; // new multiple resumes
    selectedResumeId?: string;
}

type ModalStep = "role" | "unlock" | "card-new" | "bank-transfer" | "processing" | "success";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PaymentModal({ isOpen, onClose }: PaymentModalProps) {
    const router = useRouter();
    const [step, setStep] = useState<ModalStep>("role");
    const [user, setUser] = useState<UserProfile | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<"card" | "bank">("card");
    const [copied, setCopied] = useState(false);
    const [sessionCount, setSessionCount] = useState(1);
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
    const PRICE_PER_SESSION = 1500;

    useEffect(() => {
        if (isOpen) {
            setStep("role");
            const raw = localStorage.getItem("useladder_user");
            if (raw) {
                try { 
                    const parsedUser: UserProfile = JSON.parse(raw);
                    
                    // Migration & Naming Fix: Ensure consistent naming
                    if (parsedUser.resume && !parsedUser.resumes) {
                        parsedUser.resumes = [{
                            id: 'legacy-1',
                            name: 'Previously uploaded resume',
                            data: parsedUser.resume,
                            createdAt: new Date().toISOString()
                        }];
                        parsedUser.selectedResumeId = 'legacy-1';
                    } else if (parsedUser.resumes) {
                        // Rename any existing "My Resume" to "Previously uploaded resume"
                        parsedUser.resumes = parsedUser.resumes.map(r => 
                            r.name === "My Resume" ? { ...r, name: "Previously uploaded resume" } : r
                        );
                    }
                    
                    setUser(parsedUser);
                    if (parsedUser.selectedResumeId) {
                        setSelectedResumeId(parsedUser.selectedResumeId);
                    } else if (parsedUser.resumes && parsedUser.resumes.length > 0) {
                        setSelectedResumeId(parsedUser.resumes[0].id);
                    }
                } catch { /* ignore */ }
            }
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const domain = user?.domain || "Software & Engineering";
    const role = user?.role || "Full Stack Developer";
    const seniority = user?.seniority || "Mid-Level";
    const userName = user?.name || (user?.email ? user.email.split("@")[0] : "User");

    const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setResumeFile(e.target.files[0]);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleConfirmRole = async () => {
        if (!user) return;

        let updatedUser = { ...user };
        
        // 1. If a new file was uploaded, process it
        if (resumeFile) {
            const reader = new FileReader();
            const resumeBase64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(resumeFile);
            });
            
            const newResume: ResumeEntry = {
                id: `res-${Date.now()}`,
                name: resumeFile.name,
                data: resumeBase64,
                createdAt: new Date().toISOString()
            };
            
            const currentResumes = updatedUser.resumes || [];
            updatedUser.resumes = [newResume, ...currentResumes].slice(0, 5); // Keep last 5
            updatedUser.selectedResumeId = newResume.id;
        } else if (selectedResumeId) {
            // 2. User selected an existing resume
            updatedUser.selectedResumeId = selectedResumeId;
        }

        localStorage.setItem("useladder_user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        setStep("unlock");
    };

    const handleProceed = () => {
        setStep("processing");
        setTimeout(() => {
            setStep("success");
        }, 2000);
    };

    const handleMethodSelect = (method: "card" | "bank") => {
        setSelectedMethod(method);
        if (method === "card") {
            setStep("card-new");
        } else {
            setStep("bank-transfer");
        }
    };

    return (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.modal}>
                {/* Close Button */}
                <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {/* ════════════════════════════════════
                    STEP 1: Role Confirmation
                   ════════════════════════════════════ */}
                {step === "role" && (
                    <>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                <span className={styles.modalTitleAccent}>Role</span>
                            </h2>
                            <div className={styles.headerLine} />
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.roleDescription}>
                                Your adaptive path for {role} is calibrated and ready.<br />
                                Let&apos;s see what you&apos;ve got.
                            </p>

                            <h3 className={styles.roleQuestion}>What are we practicing today?</h3>
                            <span className={styles.defaultLabel}>Default</span>

                            <div className={styles.roleCards}>
                                {/* Default Role Card */}
                                <div className={`${styles.roleCard} ${styles.roleCardSelected}`}>
                                    <div>
                                        <span className={styles.roleCardLabel}>Domain: </span>
                                        <span className={styles.roleCardValue}>{domain}</span>
                                    </div>
                                    <hr className={styles.roleCardLine} />
                                    <div>
                                        <span className={styles.roleCardLabel}>Role: </span>
                                        <span className={styles.roleCardValue}>{role}</span>
                                    </div>
                                    <hr className={styles.roleCardLine} />
                                    <div>
                                        <span className={styles.roleCardLabel}>Seniority: </span>
                                        <span className={styles.roleCardValue}>{seniority}</span>
                                    </div>
                                </div>

                                {/* Practice Different Role */}
                                <div className={styles.roleCard}>
                                    <div className={styles.practiceLink}>
                                        Practice for a<br />different role
                                    </div>
                                </div>
                            </div>

                            {/* Resume Upload Section */}
                            <div className={styles.resumeUploadSection}>
                                <p className={styles.resumeLabel}>Attach Resume (Optional)</p>
                                
                                {/* Active Selection Indicator */}
                                {(resumeFile || selectedResumeId) && (
                                    <div className={styles.activeResumeBadge}>
                                        <div className={styles.activeResumeInfo}>
                                            <div className={styles.activeDot} />
                                            <span className={styles.activeLabel}>Selected: </span>
                                            <span className={styles.activeName}>
                                                {resumeFile ? resumeFile.name : user?.resumes?.find(r => r.id === selectedResumeId)?.name}
                                            </span>
                                        </div>
                                        <button 
                                            className={styles.removeActiveResume} 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setResumeFile(null);
                                                setSelectedResumeId(null);
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}

                                {/* New Upload Area */}
                                <div className={styles.uploadBox}>
                                    <input
                                        type="file"
                                        id="resume-upload"
                                        className={styles.hiddenInput}
                                        accept=".pdf,.doc,.docx"
                                        onChange={(e) => {
                                            handleResumeChange(e);
                                            setSelectedResumeId(null);
                                        }}
                                    />
                                    <label htmlFor="resume-upload" className={styles.uploadLabel}>
                                        <div className={styles.uploadContent}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="17 8 12 3 7 8" />
                                                <line x1="12" y1="3" x2="12" y2="15" />
                                            </svg>
                                            <span>Click to upload CV (PDF/DOC)</span>
                                        </div>
                                    </label>
                                </div>

                                {/* Previous Resumes List */}
                                {user?.resumes && user.resumes.length > 0 && (
                                    <div className={styles.previousResumes}>
                                        <p className={styles.subLabel}>Previously used resumes</p>
                                        <div className={styles.resumeList}>
                                            {user.resumes.map((res) => (
                                                <button
                                                    key={res.id}
                                                    className={`${styles.resumeListItem} ${selectedResumeId === res.id ? styles.resumeListItemActive : ""}`}
                                                    onClick={() => {
                                                        setSelectedResumeId(res.id);
                                                        setResumeFile(null);
                                                    }}
                                                >
                                                    <div className={styles.resumeItemInfo}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                            <polyline points="14 2 14 8 20 8" />
                                                        </svg>
                                                        <span className={styles.resumeName}>{res.name}</span>
                                                    </div>
                                                    {selectedResumeId === res.id && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                className={styles.confirmBtn}
                                onClick={handleConfirmRole}
                            >
                                Confirm role
                            </button>
                        </div>
                    </>
                )}

                {/* ════════════════════════════════════
                    STEP 2: Unlock Session
                   ════════════════════════════════════ */}
                {step === "unlock" && (
                    <>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Unlock Your Session</h2>
                            <div className={styles.headerLine} />
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.unlockDescription}>
                                A dynamically generated adaptive session based on<br />
                                your specific experience.
                            </p>

                            <div className={styles.features}>
                                <span className={styles.feature}>
                                    <svg className={styles.checkIcon} width="18" height="18" viewBox="0 0 24 24" fill="#4793f7" stroke="none">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Full Adaptive AI Interview
                                </span>
                                <span className={styles.feature}>
                                    <svg className={styles.checkIcon} width="18" height="18" viewBox="0 0 24 24" fill="#4793f7" stroke="none">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Comprehensive Performance Report
                                </span>
                            </div>

                            <div className={styles.amountSection}>
                                <p className={styles.amountLabel}>Sessions</p>
                                <div className={styles.quantitySelector}>
                                    <button
                                        className={styles.quantityBtn}
                                        onClick={() => setSessionCount(Math.max(1, sessionCount - 1))}
                                    >
                                        −
                                    </button>
                                    <span className={styles.quantityValue}>{sessionCount}</span>
                                    <button
                                        className={styles.quantityBtn}
                                        onClick={() => setSessionCount(sessionCount + 1)}
                                    >
                                        +
                                    </button>
                                </div>
                                <p className={styles.amountLabel} style={{ marginTop: '1rem' }}>Total</p>
                                <div className={styles.amountBox}>₦{(PRICE_PER_SESSION * sessionCount).toLocaleString()}</div>
                                <p className={styles.amountLocal}>₦{PRICE_PER_SESSION.toLocaleString()} × {sessionCount} session{sessionCount > 1 ? 's' : ''}</p>
                            </div>

                            <p className={styles.methodLabel}>Payment Method</p>
                            <div className={styles.methodButtons}>
                                <button
                                    className={styles.methodBtn}
                                    onClick={() => handleMethodSelect("card")}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                                        <line x1="1" y1="10" x2="23" y2="10" />
                                    </svg>
                                    Credit / Debit Card
                                </button>
                                <button
                                    className={styles.methodBtn}
                                    onClick={() => handleMethodSelect("bank")}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="17 1 21 5 17 9" />
                                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                        <polyline points="7 23 3 19 7 15" />
                                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                    </svg>
                                    Bank Transfer
                                </button>
                            </div>
                        </div>
                    </>
                )}


                {/* ════════════════════════════════════
                    STEP 3a-alt: Card – New Card Form
                   ════════════════════════════════════ */}
                {step === "card-new" && (
                    <>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Unlock Your Session</h2>
                            <div className={styles.headerLine} />
                        </div>
                        <div className={styles.modalBody}>
                            {/* Tabs */}
                            <div className={styles.paymentTabs}>
                                <button className={`${styles.paymentTab} ${styles.paymentTabActive}`}>
                                    <div className={styles.methodCheck}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                                    Credit / Debit Card
                                </button>
                                <button className={styles.paymentTab} onClick={() => setStep("bank-transfer")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                    Bank Transfer
                                </button>
                            </div>

                            <div className={styles.dividerText}>Pay with Credit / Debit Card</div>

                            <div className={styles.cardForm}>
                                <input
                                    className={styles.cardInput}
                                    type="text"
                                    placeholder="Card Number"
                                    maxLength={19}
                                />
                                <div className={styles.cardRow}>
                                    <input
                                        className={styles.cardInput}
                                        type="text"
                                        placeholder="Expiry Date"
                                        maxLength={5}
                                    />
                                    <input
                                        className={styles.cardInput}
                                        type="text"
                                        placeholder="Cvv"
                                        maxLength={4}
                                    />
                                </div>
                                <div className={styles.saveCardCheck}>
                                    <input type="checkbox" className={styles.saveCardCheckbox} id="saveCard" />
                                    <label htmlFor="saveCard" className={styles.saveCardLabel}>Save card for future payments</label>
                                </div>
                            </div>

                            <div className={styles.securityNote}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Safe and Secured Payment
                            </div>

                            <button className={styles.proceedBtn} onClick={handleProceed}>
                                Proceed
                            </button>

                            <button className={styles.changeMethodLink} onClick={() => setStep("unlock")}>
                                Change Payment Method
                            </button>
                        </div>
                    </>
                )}

                {/* ════════════════════════════════════
                    STEP 3b: Bank Transfer
                   ════════════════════════════════════ */}
                {step === "bank-transfer" && (
                    <>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Unlock Your Session</h2>
                            <div className={styles.headerLine} />
                        </div>
                        <div className={styles.modalBody}>
                            {/* Tabs */}
                            <div className={styles.paymentTabs}>
                                <button className={styles.paymentTab} onClick={() => setStep("card-new")}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                                    Credit / Debit Card
                                </button>
                                <button className={`${styles.paymentTab} ${styles.paymentTabActive}`}>
                                    <div className={styles.methodCheck}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                                    Bank Transfer
                                </button>
                            </div>

                            <div className={styles.dividerText}>Pay with Bank Transfer</div>

                            <p className={styles.transferAmount}>
                                Transfer <span className={styles.transferAmountBold}>NGN {(PRICE_PER_SESSION * sessionCount).toLocaleString()}</span>
                            </p>
                            <p className={styles.transferExpiry}>
                                Account number expires in <span className={styles.transferExpiryTime}>45 Mins</span>
                            </p>

                            <div className={styles.bankCard}>
                                <div className={styles.bankRow}>
                                    <span className={styles.bankLabel}>Bank Name:</span>
                                    <span className={styles.bankValue}>—</span>
                                </div>
                                <div className={styles.bankRow}>
                                    <span className={styles.bankLabel}>Account Number:</span>
                                    <span className={styles.bankValue}>—</span>
                                </div>
                                <div className={styles.bankRow}>
                                    <span className={styles.bankLabel}>Account Name:</span>
                                    <span className={styles.bankValue}>—</span>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#888', textAlign: 'center', marginTop: '0.75rem' }}>
                                    Bank details will be generated via Paystack
                                </p>
                            </div>

                            <button className={styles.proceedBtn} onClick={handleProceed}>
                                I have Transferred
                            </button>

                            <button className={styles.changeMethodLink} onClick={() => setStep("unlock")}>
                                Change Payment Method
                            </button>
                        </div>
                    </>
                )}

                {/* ════════════════════════════════════
                    Processing State
                   ════════════════════════════════════ */}
                {step === "processing" && (
                    <div className={styles.modalBody}>
                        <div className={styles.processingState}>
                            <div className={styles.spinner} />
                            <span className={styles.processingText}>Verifying payment...</span>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════
                    Receipt / Success Screen
                   ════════════════════════════════════ */}
                {step === "success" && (
                    <div className={styles.modalBody}>
                        <div className={styles.receiptScreen}>
                            <h2 className={styles.receiptBrand}>The Prep</h2>

                            <div className={styles.receiptCheckIcon}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>

                            <div className={styles.receiptDivider} />

                            <p className={styles.receiptAmount}>₦{(PRICE_PER_SESSION * sessionCount).toLocaleString()}</p>
                            <p className={styles.receiptDate}>
                                {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                {"  "}
                                {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </p>

                            <div className={styles.receiptLine} />

                            <p className={styles.receiptSession}>
                                <strong>Adaptive Interview</strong> /{role}
                            </p>

                            <div className={styles.receiptDetails}>
                                <div className={styles.receiptRow}>
                                    <span className={styles.receiptLabel}>Reference number</span>
                                    <span className={styles.receiptValue}>
                                        {`ZN1PM${Date.now().toString().slice(-8)}`}
                                    </span>
                                </div>
                                <div className={styles.receiptRow}>
                                    <span className={styles.receiptLabel}>Payment method</span>
                                    <span className={styles.receiptValue}>
                                        {selectedMethod === "card" ? "Credit/Debit Card" : "Bank Transfer"}
                                    </span>
                                </div>
                            </div>

                            <p className={styles.receiptTagline}>ON THE JOURNEY TO YOUR<br />DREAM ROLE</p>

                            <button className={styles.saveReceiptBtn}>
                                SAVE RECEIPT
                            </button>

                            <button
                                className={styles.continueLink}
                                onClick={() => {
                                    onClose();
                                    router.push("/interview");
                                }}
                            >
                                CONTINUE
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
