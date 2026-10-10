import Link from "next/link";

export const metadata = {
    title: "Terms & Conditions",
    description: "Terms and conditions for get prepped by Zero and One Solutions Limited.",
    alternates: { canonical: "/terms" },
};

export default function TermsPage() {
    return (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "5rem 1.5rem", fontFamily: "Inter, sans-serif", color: "#0F172A", lineHeight: 1.6 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#2563EB", textDecoration: "none", marginBottom: "2rem", fontWeight: 500 }}>
                ← Back to Home
            </Link>
            <h1 style={{ fontSize: "2.5rem", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>Terms & Conditions</h1>
            <p style={{ color: "#64748B", marginBottom: "3rem" }}>Last updated: September 2026 • Zero and One Solutions Limited</p>
            <section style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>1. Acceptance of Terms</h2>
                    <p style={{ color: "#475569" }}>By accessing or using get prepped and related services operated by Zero and One Solutions Limited, you agree to be bound by these terms.</p>
                </div>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>2. User Responsibilities</h2>
                    <p style={{ color: "#475569" }}>You agree to provide accurate information during practice sessions and use the platform solely for lawful professional career preparation.</p>
                </div>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>3. Intellectual Property</h2>
                    <p style={{ color: "#475569" }}>All content, rubrics, software, and simulation engines are the exclusive property of Zero and One Solutions Limited.</p>
                </div>
            </section>
        </div>
    );
}
