import React from "react";

/** Background colours for companies shown as an initial (the letter is white). */
const INITIAL_COLOURS = ["#4782F6", "#1F9D6B", "#E08A1E", "#7C5CE0", "#D9467E", "#1A93B8", "#475569"];

/** The first letter or digit of the name ("(Kwik) Delivery" → "K"). */
export function companyInitial(company: string): string {
    return (company || "").match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "•";
}

/**
 * A company's logo. The address is one we stored ourselves when the job was
 * collected (see lib/companyLogos); a company with none shows its initial.
 * Nothing is guessed here, so a job never shows another company's mark.
 */
function CompanyLogoComponent({ company, logoUrl, size = 28 }: { company: string; logoUrl?: string; size?: number; url?: string }) {
    const [imgFailed, setImgFailed] = React.useState(false);
    const radius = Math.round(size * 0.28);

    if (logoUrl && !imgFailed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={logoUrl}
                alt={`${company} logo`}
                width={size}
                height={size}
                loading="lazy"
                decoding="async"
                style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", background: "#FFFFFF", border: "1px solid #E2E8F0", display: "block" }}
                onError={() => setImgFailed(true)}
            />
        );
    }

    const name = (company || "").trim().toLowerCase();
    const background = INITIAL_COLOURS[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % INITIAL_COLOURS.length];
    return (
        <div
            aria-hidden="true"
            style={{ width: size, height: size, borderRadius: radius, background, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.46), fontWeight: 700, lineHeight: 1 }}
        >
            {companyInitial(company)}
        </div>
    );
}

export const CompanyLogo = React.memo(CompanyLogoComponent);
