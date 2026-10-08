"use client";

import { useState, useMemo } from "react";
import styles from "./pricing.module.css";
import footerStyles from "./landing.module.css";
import Link from "next/link";

export default function PricingPage() {
    const [customPasses, setCustomPasses] = useState<number>(10);

    // Dynamic volume-discount calculation for flexible passes
    // Smooth tiered progression so 2-6 passes are cleanly below the 7-day bundle (₦6,500)
    // and scale up to 60% discount for larger packs
    const customPlan = useMemo(() => {
        const n = Math.max(2, Math.min(50, customPasses));
        let totalPrice: number;

        if (n <= 7) {
            // Smooth progression from 1 pass (1,500) to 7 passes (6,500, matching 1-Week Bundle)
            // 4 passes = ₦4,000, 5 passes = ₦4,800, 6 passes = ₦5,700, 7 passes = ₦6,500
            const raw = 1500 + (n - 1) * (5000 / 6);
            totalPrice = Math.round(raw / 100) * 100;
        } else if (n <= 30) {
            // Smooth progression from 7 passes (6,500) to 30 passes (18,000 = ₦600/pass, 60% discount)
            const raw = 6500 + (n - 7) * ((18000 - 6500) / (30 - 7));
            totalPrice = Math.round(raw / 100) * 100;
        } else {
            // Beyond 30 passes, 60% discount (₦600 / pass)
            totalPrice = n * 600;
        }

        const regularTotal = n * 1500;
        const perPass = Math.round(totalPrice / n);
        const discountPct = Math.round(((regularTotal - totalPrice) / regularTotal) * 100);

        return {
            count: n,
            totalPrice,
            perPass,
            discountPct,
        };
    }, [customPasses]);
    return (
        <div className={styles.page}>
            {/* ── Top Navigation (Identical to Landing Page) ── */}
            <header className={styles.nav}>
                <div className={styles.navInner}>
                    <Link href="/#top" className={styles.logo}>
                        <div className={styles.logoMark}>
                            <img
                                src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                                alt="get prepped"
                                className={styles.logoImg}
                            />
                        </div>
                        <span className={styles.logoType}>get prepped</span>
                    </Link>
                    <nav className={styles.navLinks}>
                        <Link href="/#products" className={styles.navLink}>Products</Link>
                        <Link href="/pricing" className={`${styles.navLink} ${styles.navLinkActive}`}>Pricing</Link>
                        <Link href="/#resources" className={styles.navLink}>Resources</Link>
                    </nav>
                    <div className={styles.navActions}>
                        <Link href="/onboarding" className={styles.navCta}>Practice</Link>
                    </div>
                </div>
            </header>

            {/* ── Pricing Hero & Cards ── */}
            <main className={styles.pricingMain}>
                <div className={styles.pricingHeader}>
                    <h1 className={styles.pricingTitle}>
                        Practice on your terms.<br />
                        All features included in every pass.
                    </h1>
                </div>

                {/* ── 3 Pricing Columns ── */}
                <div className={styles.pricingGrid}>
                    {/* Card 1: Day Pass */}
                    <div className={styles.pricingCol}>
                        <div className={styles.cardTop}>
                            <div className={styles.tierHeader}>
                                <div className={styles.tierTitleRow}>
                                    <strong className={styles.tierName}>Day Pass</strong>
                                </div>
                                <span className={styles.tierDesc}>24 hours of full platform access from activation</span>
                            </div>

                            <div className={styles.priceRow}>
                                <span className={styles.priceAmount}>₦1,500</span>
                                <span className={styles.pricePeriod}>/pass</span>
                            </div>

                            <ul className={styles.featureList}>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Flexible pass — activate when you’re ready</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Live interview with the AI Recruiter</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Instant feedback from your AI Coach</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Interview scorecards and delivery tips</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Resume ATS scan and keyword feedback</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Interviews tailored to any job posting</span>
                                </li>
                            </ul>
                        </div>

                        <div className={styles.cardBottom}>
                            <Link href="/onboarding?plan=day" className={styles.btnDefault}>
                                Get Day Pass
                            </Link>
                        </div>
                    </div>

                    {/* Card 2: 1-Week Bundle */}
                    <div className={styles.pricingCol}>
                        <div className={styles.cardTop}>
                            <div className={styles.tierHeader}>
                                <div className={styles.tierTitleRow}>
                                    <strong className={styles.tierName}>1-Week Bundle</strong>
                                    <span className={styles.saveBadgeBlue}>Save 38%</span>
                                </div>
                                <span className={styles.tierDesc}>Best for focused interview prep across multiple applications</span>
                            </div>

                            <div className={styles.priceRow}>
                                <span className={styles.priceAmount}>₦6,500</span>
                                <span className={styles.pricePeriod}>/7 passes</span>
                            </div>

                            <ul className={styles.featureList}>
                                <li className={`${styles.featureItem} ${styles.featureItemPrimary}`}>
                                    <span className={styles.plusIconWrap}>
                                        <svg className={styles.plusSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="6" y1="2" x2="6" y2="10" />
                                            <line x1="2" y1="6" x2="10" y2="6" />
                                        </svg>
                                    </span>
                                    <span>Everything in Day Pass</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>7 flexible passes</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Practice for multiple roles and companies</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Track your scores across sessions</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Deeper behavioral and technical follow-ups</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Review and tailor multiple resumes</span>
                                </li>
                            </ul>
                        </div>

                        <div className={styles.cardBottom}>
                            <Link href="/onboarding?plan=week" className={styles.btnPrimary}>
                                Get 1-Week Bundle
                            </Link>
                        </div>
                    </div>

                    {/* Card 3: Flexible Bundle (Custom Passes) */}
                    <div className={styles.pricingCol}>
                        <div className={styles.cardTop}>
                            <div className={styles.tierHeader}>
                                <div className={styles.tierTitleRow}>
                                    <strong className={styles.tierName}>Flexible Bundle</strong>
                                    <span className={styles.saveBadgeBlue}>
                                        {customPlan.discountPct > 0 ? `Save ${customPlan.discountPct}%` : "Save up to 60%"}
                                    </span>
                                </div>
                                <span className={styles.tierDesc}>For candidates who want to keep practicing until they’re ready</span>
                            </div>

                            <div className={styles.priceRowFlexible}>
                                <span className={styles.priceAmount}>₦{customPlan.totalPrice.toLocaleString()}</span>
                                <div className={styles.stepperContainer}>
                                    <button
                                        type="button"
                                        className={styles.stepperBtn}
                                        onClick={() => setCustomPasses(prev => Math.max(2, prev - 1))}
                                        disabled={customPasses <= 2}
                                        aria-label="Decrease passes"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                            <line x1="2" y1="6" x2="10" y2="6" />
                                        </svg>
                                    </button>
                                    <span className={styles.stepperDisplay}>{customPasses} passes</span>
                                    <button
                                        type="button"
                                        className={styles.stepperBtn}
                                        onClick={() => setCustomPasses(prev => Math.min(50, prev + 1))}
                                        disabled={customPasses >= 50}
                                        aria-label="Increase passes"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                            <line x1="6" y1="2" x2="6" y2="10" />
                                            <line x1="2" y1="6" x2="10" y2="6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <ul className={styles.featureList}>
                                <li className={`${styles.featureItem} ${styles.featureItemPrimary}`}>
                                    <span className={styles.plusIconWrap}>
                                        <svg className={styles.plusSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="6" y1="2" x2="6" y2="10" />
                                            <line x1="2" y1="6" x2="10" y2="6" />
                                        </svg>
                                    </span>
                                    <span>Everything in 1-Week Bundle</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Choose how many passes you need</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Practice across different roles and seniority levels</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Track your progress and recurring weak spots</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Tailor your resume for different applications</span>
                                </li>
                                <li className={styles.featureItem}>
                                    <span className={styles.checkIconWrap}>
                                        <svg className={styles.checkSvg} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                                        </svg>
                                    </span>
                                    <span>Keep practicing until you land the offer</span>
                                </li>
                            </ul>
                        </div>

                        <div className={styles.cardBottom}>
                            <a href={`/onboarding?plan=flexible&passes=${customPasses}`} className={styles.btnPrimary}>
                                Get Flexible Bundle
                            </a>
                        </div>
                    </div>
                </div>
            </main>

            {/* ── Clean 2-column Footer ── */}
            <footer className={footerStyles.cleanFooter}>
                <div className={footerStyles.cleanFooterInner}>
                    <div className={footerStyles.cleanFooterColumns}>
                        <div className={footerStyles.cleanFooterCol}>
                            <h3 className={footerStyles.cleanFooterColTitle}>Company</h3>
                            <div className={footerStyles.cleanFooterLinks}>
                                <Link href="/#products" className={footerStyles.cleanFooterLink}>Products</Link>
                                <Link href="/pricing" className={footerStyles.cleanFooterLink}>Pricing</Link>
                                <Link href="/#resources" className={footerStyles.cleanFooterLink}>Resources</Link>
                                <Link href="/onboarding" className={footerStyles.cleanFooterLink}>Practice</Link>
                            </div>
                        </div>

                        <div className={footerStyles.cleanFooterCol}>
                            <h3 className={footerStyles.cleanFooterColTitle}>Follow us</h3>
                            <div className={footerStyles.cleanFooterLinks}>
                                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className={footerStyles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={footerStyles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                    <span>Facebook</span>
                                </a>
                                <a href="https://x.com" target="_blank" rel="noopener noreferrer" className={footerStyles.cleanFooterSocialLink}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className={footerStyles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                    <span>X(Twitter)</span>
                                </a>
                                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className={footerStyles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={footerStyles.cleanFooterSocialIcon} aria-hidden="true">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                                    </svg>
                                    <span>Instagram</span>
                                </a>
                                <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className={footerStyles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={footerStyles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.29 6.29 0 0 0 1.94-4.52v-6.9a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.94-.16z"/>
                                    </svg>
                                    <span>Tiktok</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className={footerStyles.cleanFooterBottom}>
                        <p className={footerStyles.cleanFooterCopyright}>
                            Copyright © 2026 Zero and One Solutions Limited. All rights reserved.
                        </p>
                        <div className={footerStyles.cleanFooterLegal}>
                            <Link href="/terms" className={footerStyles.cleanFooterLegalLink}>Terms & Conditions</Link>
                            <span className={footerStyles.cleanFooterLegalDot} aria-hidden="true">•</span>
                            <Link href="/privacy" className={footerStyles.cleanFooterLegalLink}>Privacy Policy</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
