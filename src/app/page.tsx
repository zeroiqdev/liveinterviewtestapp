import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";
import { COMPANY_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Tells search engines what the site is: who runs it, and that it's a web app
// and what it costs from. Only facts shown on the site — no ratings or review counts.
const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: SITE_NAME,
            legalName: COMPANY_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/icon-512.png`,
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
        {
            "@type": "SoftwareApplication",
            name: SITE_NAME,
            url: SITE_URL,
            applicationCategory: "EducationalApplication",
            operatingSystem: "Web",
            description: SITE_DESCRIPTION,
            offers: { "@type": "AggregateOffer", lowPrice: "1500", priceCurrency: "NGN", url: `${SITE_URL}/pricing` },
            publisher: { "@id": `${SITE_URL}/#organization` },
        },
    ],
};

export default function Home() {
    return (
        <>
            <script
                type="application/ld+json"
                // Static, server-built JSON: "<" is escaped so it can't close the tag.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
            />
            <LandingPage />
        </>
    );
}
