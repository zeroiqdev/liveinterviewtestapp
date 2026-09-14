import React from "react";

function getDomainForCompany(company: string, url?: string): string {
    const c = (company || "").trim().toLowerCase();
    const knownDomains: Record<string, string> = {
        piggyvest: "piggyvest.com",
        bamboo: "investbamboo.com",
        spacex: "spacex.com",
        paystack: "paystack.com",
        moniepoint: "moniepoint.com",
        flutterwave: "flutterwave.com",
        kuda: "kudabank.com",
        interswitch: "interswitchgroup.com",
        andela: "andela.com",
        nomba: "nomba.com",
        jumia: "jumia.com",
        helium: "heliumhealth.com",
        stripe: "stripe.com",
        openai: "openai.com",
        notion: "notion.so",
        linear: "linear.app",
        vercel: "vercel.com",
        anthropic: "anthropic.com",
        google: "google.com",
        microsoft: "microsoft.com",
        apple: "apple.com",
        scale: "scale.com",
        flexport: "flexport.com",
        retool: "retool.com",
        figma: "figma.com",
        canva: "canva.com",
        spotify: "spotify.com",
        netflix: "netflix.com",
        airbnb: "airbnb.com",
        uber: "uber.com",
    };
    for (const [k, d] of Object.entries(knownDomains)) {
        if (c.includes(k)) return d;
    }
    if (url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
            if (!host.includes("greenhouse.io") && !host.includes("lever.co") && !host.includes("ashbyhq.com") && !host.includes("workable.com") && !host.includes("seamlesshiring.com")) {
                return host;
            }
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (parts[0] && (host.includes("greenhouse") || host.includes("lever") || host.includes("ashby"))) {
                return `${parts[0]}.com`;
            }
        } catch {
            // Ignore
        }
    }
    return c.replace(/[^a-z0-9]/g, "") + ".com";
}

function CompanyLogoComponent({ company, url, logoUrl }: { company: string; url?: string; logoUrl?: string }) {
    const c = (company || "").trim().toLowerCase();
    const [imgFailed, setImgFailed] = React.useState(false);

    if (logoUrl && !imgFailed) {
        return (
            <img
                src={logoUrl}
                alt={`${company} logo`}
                width="28"
                height="28"
                style={{ borderRadius: "8px", objectFit: "contain", background: "#FFFFFF", border: "1px solid #E2E8F0", display: "block", padding: "2px" }}
                onError={() => setImgFailed(true)}
            />
        );
    }

    if (c.includes("linkedin")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0A66C2"/>
                <path d="M10 13h3.5v11H10V13zm1.8-5.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm5.2 5.5H20v1.5h.1c.4-.8 1.6-1.8 3.2-1.8 3.5 0 4.2 2.3 4.2 5.3v6H24v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8v5.4h-3.2V13z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("jobberman")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#007BFF"/>
                <circle cx="16" cy="12" r="4.2" fill="#FFC107"/>
                <path d="M9 23c0-3.8 3.1-7 7-7s7 3.2 7 7" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>
        );
    }
    if (c.includes("wellfound") || c.includes("angellist")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#000000"/>
                <path d="M8 9l4 14h3l2.5-9 2.5 9h3L27 9h-3.5l-2 9.5-2.5-9.5h-2.5l-2.5 9.5L11.5 9H8z" fill="#FF6154"/>
            </svg>
        );
    }
    if (c.includes("indeed")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#2164F3"/>
                <circle cx="16" cy="9.5" r="2.5" fill="#ffffff"/>
                <path d="M13.5 14h5v10h-5z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("glassdoor")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0CAA41"/>
                <path d="M11 9h10v14H11z" fill="none" stroke="#ffffff" strokeWidth="2.5" rx="2"/>
                <circle cx="18" cy="16" r="1.2" fill="#ffffff"/>
            </svg>
        );
    }

    if (c.includes("spacex")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#000000"/>
                <path d="M7 20l10-8h6L14 20H7zm4 3.5l3.5-3h6L16 23.5h-5z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("bamboo")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#00C853"/>
                <path d="M10 8h3.5v16H10V8zm7 4.5h3.5v11.5H17V12.5z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("piggyvest") || c.includes("piggy")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0D60D8"/>
                <path d="M10 8h7a5 5 0 0 1 5 5c0 2.8-2.2 5-5 5h-3.2V24H10V8zm3.8 3.6v3.2h3.2c1 0 1.8-.8 1.8-1.6s-.8-1.6-1.8-1.6h-3.2z" fill="#22C55E"/>
            </svg>
        );
    }
    if (c.includes("paystack")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#00C3F7"/>
                <path d="M7 11h18v3.5H7V11zm0 6.5h18V21H7v-3.5z" fill="#001E3C"/>
                <path d="M7 23.5h10V26H7v-2.5z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("moniepoint") || c.includes("teamapt")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0366D6"/>
                <path d="M8 23V9l8 8 8-8v14h-3.8V14.6l-4.2 4.2-4.2-4.2V23H8z" fill="#FFC524"/>
            </svg>
        );
    }
    if (c.includes("flutterwave")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#FB9129"/>
                <path d="M8 12c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4s-1.8 4-4 4h-4c-2.2 0-4 1.8-4 4s1.8 4 4 4h8" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
            </svg>
        );
    }
    if (c.includes("kuda")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#40196D"/>
                <path d="M10 8h3.8v6.5L19.2 8h4.8l-6.2 7.2L24.5 24h-4.8l-5.9-7.5V24H10V8z" fill="#40D6B7"/>
            </svg>
        );
    }
    if (c.includes("interswitch")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0F172A"/>
                <circle cx="16" cy="11" r="3.2" fill="#DF1E26"/>
                <path d="M13.5 16h5v8h-5z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("andela")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#3359DF"/>
                <path d="M16 8l7 15h-4.2l-2.8-6.2h-2L11.2 23H7l7-15zm0 5.2l-1.5 3.3h3L16 13.2z" fill="#00D188"/>
            </svg>
        );
    }
    if (c.includes("nomba")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#FFDD00"/>
                <path d="M9 8h3.8l6.4 10.5V8H23v16h-3.8L12.8 13.5V24H9V8z" fill="#0F172A"/>
            </svg>
        );
    }
    if (c.includes("jumia")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#F68B1E"/>
                <path d="M16 8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L16 8z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("helium")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#0284C7"/>
                <path d="M10 8h3.5v6.2h5V8H22v16h-3.5v-6.5h-5V24H10V8z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("stripe")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#635BFF"/>
                <path d="M14.5 13.8c0-.9.7-1.3 1.9-1.3 1.7 0 3.8.5 5.5 1.5V9.4c-1.8-.7-3.7-1-5.5-1-4.7 0-7.8 2.5-7.8 6.6 0 6.4 8.8 5.4 8.8 8.2 0 1.1-1 1.5-2.3 1.5-2 0-4.5-.8-6.5-2v4.8c2.2.9 4.4 1.3 6.5 1.3 4.9 0 8.3-2.4 8.3-6.6 0-6.9-8.9-5.7-8.9-8.4z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("openai")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#000000"/>
                <path d="M25.6 13.4a6.2 6.2 0 0 0-.5-4.8 6.4 6.4 0 0 0-6-3.2 6.3 6.3 0 0 0-4.8 2.2 6.3 6.3 0 0 0-8.2 3A6.2 6.2 0 0 0 7 15.4a6.3 6.3 0 0 0 .5 4.8 6.4 6.4 0 0 0 6 3.2 6.3 6.3 0 0 0 4.8-2.2 6.3 6.3 0 0 0 8.2-3 6.2 6.2 0 0 0-.9-4.8zm-9.6 10.3a4.7 4.7 0 0 1-3.1-1.2l.2-.1 4.5-2.6a.8.8 0 0 0 .4-.7v-6.3l2 1.2a.1.1 0 0 1 .1.1v5a4.7 4.7 0 0 1-4.1 4.6zm-8.8-4.2a4.7 4.7 0 0 1-.6-3.3l.2.1 4.5 2.6a.8.8 0 0 0 .8 0l5.5-3.2v2.3a.1.1 0 0 1-.1.1l-4.4 2.5a4.7 4.7 0 0 1-5.9-1.1zm-1.2-8.9a4.7 4.7 0 0 1 2.5-2.1v5.4a.8.8 0 0 0 .4.7l5.5 3.2-2 1.1a.1.1 0 0 1-.1 0l-4.4-2.5a4.7 4.7 0 0 1-1.9-5.8zm15.1 3.5l-5.5-3.2 2-1.2a.1.1 0 0 1 .1 0l4.4 2.5a4.7 4.7 0 0 1-.5 8.7v-5.4a.8.8 0 0 0-.4-.7zm2.4-3.4a4.7 4.7 0 0 1 .6 3.3l-.2-.1-4.5-2.6a.8.8 0 0 0-.8 0l-5.5 3.2v-2.3a.1.1 0 0 1 .1-.1l4.4-2.5a4.7 4.7 0 0 1 5.9 1.1zM14.6 17l2.2-1.3 2.2 1.3v2.6l-2.2 1.3-2.2-1.3V17z" fill="#10A37F"/>
            </svg>
        );
    }
    if (c.includes("vercel") || c.includes("notion")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#000000"/>
                <path d="M16 8.5L24 23.5H8L16 8.5Z" fill="#ffffff"/>
            </svg>
        );
    }
    if (c.includes("linear")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#5E6AD2"/>
                <path d="M9 21.5L21.5 9M9 17L17 9M9 12.5L12.5 9M9 22.5C9 22.5 10.5 22.5 11.5 22.5L22.5 11.5V9L9 22.5Z" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
        );
    }
    if (c.includes("anthropic")) {
        return (
            <svg viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: "8px", display: "block" }}>
                <rect width="32" height="32" rx="8" fill="#D97706"/>
                <path d="M16 7l6.5 17h-3.4l-1.4-3.8h-3.4L12.9 24H9.5L16 7zm0 5.4l-1.1 3.2h2.2L16 12.4z" fill="#ffffff"/>
            </svg>
        );
    }

    const domain = getDomainForCompany(company, url);
    if (!imgFailed && domain) {
        return (
            <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
                alt={`${company} logo`}
                width="28"
                height="28"
                style={{ borderRadius: "8px", objectFit: "contain", background: "#FFFFFF", border: "1px solid #E2E8F0", display: "block", padding: "2px" }}
                onError={() => setImgFailed(true)}
            />
        );
    }

    const brandColors = ["#4782F6", "#0F172A", "#4338CA", "#059669", "#D97706", "#DB2777", "#0284C7", "#7C3AED"];
    const hash = Math.abs(c.split("").reduce((a, b) => a + b.charCodeAt(0), 0)) % brandColors.length;
    const bg = brandColors[hash];

    return (
        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
            {company.charAt(0).toUpperCase()}
        </div>
    );
}

export const CompanyLogo = React.memo(CompanyLogoComponent);
