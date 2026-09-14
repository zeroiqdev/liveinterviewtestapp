import React from "react";
import { getDomainForCompany } from "./utils";

function CompanyLogoComponent({ company, url, logoUrl }: { company: string; url?: string; logoUrl?: string; index?: number }) {
    const c = (company || "").trim().toLowerCase();
    const [imgFailed, setImgFailed] = React.useState(false);

    if (logoUrl && !imgFailed) {
        return (
            <img
                src={logoUrl}
                alt={`${company} logo`}
                width="38"
                height="38"
                style={{ borderRadius: "8px", objectFit: "contain", background: "#FFFFFF", border: "1px solid #E2E8F0", display: "block", padding: "2px" }}
                onError={() => setImgFailed(true)}
            />
        );
    }

    // LinkedIn
    if (c.includes("linkedin")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0A66C2"/>
                <path d="M12 15.5h4v13h-4v-13zm2-6.5a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zm6 6.5h3.8v1.8h.1c.5-1 1.9-2.1 3.8-2.1 4.1 0 4.8 2.7 4.8 6.2v7.1h-4v-6.3c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3v6.4h-4v-13z" fill="#ffffff"/>
            </svg>
        );
    }
    // Jobberman
    if (c.includes("jobberman")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#007BFF"/>
                <circle cx="19" cy="14" r="5" fill="#FFC107"/>
                <path d="M11 27c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none"/>
            </svg>
        );
    }
    // Wellfound
    if (c.includes("wellfound") || c.includes("angellist")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M10 11l4.5 16h3.5l3-10 3 10h3.5L32 11h-4l-2.5 11-3-11h-3l-3 11L14 11h-4z" fill="#FF6154"/>
            </svg>
        );
    }
    // Indeed
    if (c.includes("indeed")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#2164F3"/>
                <circle cx="19" cy="11.5" r="3" fill="#ffffff"/>
                <path d="M16 16.5h6v12h-6z" fill="#ffffff"/>
            </svg>
        );
    }
    // Glassdoor
    if (c.includes("glassdoor")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0CAA41"/>
                <path d="M13 11h12v16H13z" fill="none" stroke="#ffffff" strokeWidth="3" rx="2"/>
                <circle cx="21" cy="19" r="1.5" fill="#ffffff"/>
            </svg>
        );
    }
    // Bamboo
    if (c.includes("bamboo")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#00A859"/>
                <path d="M12 9h4.5v20H12V9zm7 4.5h4.5v15.5H19V13.5zm7 5h4.5v10.5H26V18.5z" fill="#ffffff"/>
            </svg>
        );
    }
    // Piggyvest
    if (c.includes("piggyvest") || c.includes("piggy")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0D60D8"/>
                <path d="M11 9h8.5a6.5 6.5 0 0 1 6.5 6.5c0 3.6-2.9 6.5-6.5 6.5H15.5V29H11V9zm4.5 4.5v4.5h4c1.2 0 2.2-1 2.2-2.25s-1-2.25-2.2-2.25h-4z" fill="#00D09C"/>
            </svg>
        );
    }
    // SpaceX
    if (c.includes("spacex")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M8 24l13-11h8L17 24H8zm6 4.5l4.5-4h8L20 28.5h-6z" fill="#ffffff"/>
            </svg>
        );
    }
    // Paystack
    if (c.includes("paystack")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#00C3F7"/>
                <path d="M8 12h22v4.5H8V12zm0 7.5h22V24H8v-4.5zm0 7.5h12v3.5H8V27z" fill="#001E3C"/>
            </svg>
        );
    }
    // Moniepoint
    if (c.includes("moniepoint") || c.includes("teamapt")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0366D6"/>
                <path d="M9 28V10l10 10 10-10v18h-4.5V17.2l-5.5 5.5-5.5-5.5V28H9z" fill="#FFC524"/>
            </svg>
        );
    }
    // Flutterwave
    if (c.includes("flutterwave")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#FB9129"/>
                <path d="M9 14.5c0-2.8 2.2-5 5-5h10c2.8 0 5 2.2 5 5s-2.2 5-5 5h-5c-2.8 0-5 2.2-5 5s2.2 5 5 5h10" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
            </svg>
        );
    }
    // Kuda
    if (c.includes("kuda")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#40196D"/>
                <path d="M11 9.5h4.5v7.5L22.5 9.5H29l-7.5 8.5 7.8 10.5h-5.8l-7-9V28.5H11V9.5z" fill="#40D6B7"/>
            </svg>
        );
    }
    // Interswitch
    if (c.includes("interswitch")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0F172A"/>
                <circle cx="19" cy="13" r="3.8" fill="#DF1E26"/>
                <path d="M16 19h6v9.5h-6z" fill="#ffffff"/>
            </svg>
        );
    }
    // Andela
    if (c.includes("andela")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#3359DF"/>
                <path d="M19 9.5l8.5 18h-5l-3.5-7.5h-2.5L13 27.5H8.5l8.5-18zm0 6.2l-1.8 4h3.6L19 15.7z" fill="#00D188"/>
            </svg>
        );
    }
    // Nomba
    if (c.includes("nomba")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#FFDD00"/>
                <path d="M10.5 9.5h4.5l7.5 12.5V9.5H27v19h-4.5L14.5 16v12.5H10.5V9.5z" fill="#0F172A"/>
            </svg>
        );
    }
    // Jumia
    if (c.includes("jumia")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#F68B1E"/>
                <path d="M19 9.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.3-4.2 6-.9L19 9.5z" fill="#ffffff"/>
            </svg>
        );
    }
    // Helium
    if (c.includes("helium")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#0284C7"/>
                <path d="M11.5 9.5h4.5v7.5h6V9.5h4.5v19h-4.5V21.5h-6v7H11.5V9.5z" fill="#ffffff"/>
            </svg>
        );
    }
    // Stripe
    if (c.includes("stripe")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#635BFF"/>
                <path d="M17 16.2c0-1.1.9-1.6 2.3-1.6 2 0 4.5.6 6.5 1.7v-4.4c-2.1-.8-4.4-1.2-6.5-1.2-5.5 0-9.2 3-9.2 7.8 0 7.6 10.5 6.4 10.5 9.8 0 1.3-1.2 1.8-2.8 1.8-2.4 0-5.3-1-7.7-2.4v4.5c2.6 1 5.2 1.5 7.7 1.5 5.8 0 9.9-2.9 9.9-7.8 0-8.2-10.7-6.8-10.7-10z" fill="#ffffff"/>
            </svg>
        );
    }
    // OpenAI
    if (c.includes("openai")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M30 16a7.2 7.2 0 0 0-.6-5.7 7.6 7.6 0 0 0-7.1-3.8 7.5 7.5 0 0 0-5.7 2.5 7.5 7.5 0 0 0-9.7 3.6 7.3 7.3 0 0 0 .5 5.7 7.6 7.6 0 0 0 7.1 3.8 7.5 7.5 0 0 0 5.7-2.5 7.5 7.5 0 0 0 9.8-3.6zm-11.4 12.3a5.6 5.6 0 0 1-3.7-1.4l.2-.1 5.4-3.2a.9.9 0 0 0 .4-.8v-7.5l2.3 1.4a.1.1 0 0 1 .1.1v6a5.6 5.6 0 0 1-4.7 5.5zm-10.5-5a5.6 5.6 0 0 1-.8-3.9l.2.1 5.4 3.2a.9.9 0 0 0 1 0l6.5-3.8v2.8a.1.1 0 0 1-.1.1l-5.3 3a5.6 5.6 0 0 1-6.9-1.5z" fill="#10A37F"/>
            </svg>
        );
    }
    // Notion
    if (c.includes("notion")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M10.5 9.5l12.5-.5 3.7 3.2v16l-3.7 1.6-9.5-16v16L10.5 28V9.5zm4.8 4.8l5.8 10V14.5l-5.8-.5v.3z" fill="#ffffff"/>
            </svg>
        );
    }
    // Linear
    if (c.includes("linear")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#5E6AD2"/>
                <path d="M10.5 25.5L25.5 10.5M10.5 20.5L20.5 10.5M10.5 15.5L15.5 10.5M10.5 26.5c0 0 2 0 3.2 0L26.5 13.8V10.5L10.5 26.5Z" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
        );
    }
    // Vercel
    if (c.includes("vercel")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M19 9.5l9.5 17H9.5l9.5-17z" fill="#ffffff"/>
            </svg>
        );
    }
    // Anthropic
    if (c.includes("anthropic")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#D97706"/>
                <path d="M19 8.5l8 20h-4.2l-1.7-4.5h-4.2L15.2 28.5H11l8-20zm0 6.5l-1.4 3.8h2.8L19 15z" fill="#ffffff"/>
            </svg>
        );
    }
    // Google
    if (c.includes("google")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#ffffff" stroke="#E2E8F0"/>
                <path d="M27.5 19.3c0-.6-.1-1.3-.2-1.8H19v3.5h4.8c-.2 1.1-.9 2-1.8 2.6v2.1h3c1.7-1.6 2.5-3.9 2.5-6.4z" fill="#4285F4"/>
                <path d="M19 28c2.4 0 4.4-.8 5.9-2.1l-3-2.1c-.8.5-1.8.9-2.9.9-2.3 0-4.2-1.6-4.9-3.7h-3.1v2.3C12.5 26 15.6 28 19 28z" fill="#34A853"/>
                <path d="M14.1 21c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8v-2.3h-3.1C10.4 16.3 10 17.6 10 19s.4 2.7 1 3.9l3.1-2.3z" fill="#FBBC05"/>
                <path d="M19 13.8c1.3 0 2.5.4 3.4 1.4l2.5-2.5C23.4 11.3 21.3 10.5 19 10.5c-3.4 0-6.5 2-8 4.9l3.1 2.3c.7-2.1 2.6-3.9 4.9-3.9z" fill="#EA4335"/>
            </svg>
        );
    }
    // Microsoft
    if (c.includes("microsoft")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#ffffff" stroke="#E2E8F0"/>
                <rect x="10.5" y="10.5" width="7.5" height="7.5" fill="#F25022"/>
                <rect x="20" y="10.5" width="7.5" height="7.5" fill="#7FBA00"/>
                <rect x="10.5" y="20" width="7.5" height="7.5" fill="#00A4EF"/>
                <rect x="20" y="20" width="7.5" height="7.5" fill="#FFB900"/>
            </svg>
        );
    }
    // Apple
    if (c.includes("apple")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#000000"/>
                <path d="M23.8 19.3c0-2.8 2.3-4.2 2.4-4.3-1.3-2-3.4-2.2-4.1-2.2-1.8-.2-3.4 1.1-4.3 1.1-.9 0-2.2-1-3.7-1-1.9 0-3.7 1.1-4.6 2.8-2 3.5-.5 8.6 1.4 11.4 1 1.4 2.1 3 3.6 2.9 1.4-.1 2-.9 3.7-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.6-3.3-.1-.1-3.1-1.2-3.1-4.6zM21.5 10.9c.7-1 1.3-2.2 1.1-3.6-1.2.1-2.5.7-3.3 1.7-.6.8-1.3 2.1-1.1 3.5 1.3.1 2.5-.6 3.3-1.6z" fill="#ffffff"/>
            </svg>
        );
    }
    // Scale AI
    if (c.includes("scale")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#111827"/>
                <path d="M11.5 11.5h15v3.8h-10v3.8h8v3.8h-8V26.5h-5V11.5z" fill="#FF5E7E"/>
            </svg>
        );
    }
    // Retool
    if (c.includes("retool")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#6B46C1"/>
                <path d="M10.5 11.5h17v3.8h-17v-3.8zm0 5.3h17v3.8h-17v-3.8zm0 5.3h11v3.8h-11v-3.8z" fill="#ffffff"/>
            </svg>
        );
    }
    // Flexport
    if (c.includes("flexport")) {
        return (
            <svg viewBox="0 0 38 38" width="38" height="38" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="38" height="38" rx="8" fill="#002B49"/>
                <path d="M11.5 11.5h15v4.2h-9.5v3.2h7.5v4.2h-7.5v4.2H11.5V11.5z" fill="#00D2B4"/>
            </svg>
        );
    }

    // Dynamic live logo derived from scraper company URL or domain
    const domain = getDomainForCompany(company, url);
    if (!imgFailed && domain) {
        return (
            <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
                alt={`${company} logo`}
                width="38"
                height="38"
                style={{ borderRadius: "8px", objectFit: "contain", background: "#FFFFFF", border: "1px solid #E2E8F0", display: "block", padding: "3px" }}
                onError={() => setImgFailed(true)}
            />
        );
    }

    // High quality brand lettermark badge
    const brandColors = ["#4782F6", "#0F172A", "#4338CA", "#059669", "#D97706", "#DB2777", "#0284C7", "#7C3AED"];
    const hash = Math.abs(c.split("").reduce((a, b) => a + b.charCodeAt(0), 0)) % brandColors.length;
    const bg = brandColors[hash];

    return (
        <div style={{ width: 38, height: 38, borderRadius: 8, background: bg, color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>
            {company.charAt(0).toUpperCase()}
        </div>
    );
}

export const CompanyLogo = React.memo(CompanyLogoComponent);
