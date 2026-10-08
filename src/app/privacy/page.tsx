import Link from "next/link";

export const metadata = {
    title: "Privacy Policy — get prepped",
    description: "Privacy policy for get prepped by Zero and One Solutions Limited.",
};

export default function PrivacyPage() {
    return (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "5rem 1.5rem", fontFamily: "Inter, sans-serif", color: "#0F172A", lineHeight: 1.6 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#2563EB", textDecoration: "none", marginBottom: "2rem", fontWeight: 500 }}>
                ← Back to Home
            </Link>
            <h1 style={{ fontSize: "2.5rem", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>Privacy Policy</h1>
            <p style={{ color: "#64748B", marginBottom: "3rem" }}>Last updated: September 2026 • Zero and One Solutions Limited</p>
            <section style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>1. Information We Collect</h2>
                    <p style={{ color: "#475569" }}>We collect data you provide directly when practicing interviews, uploading resumes, or registering an account, including transcript data and performance metrics.</p>
                </div>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>2. How We Use Information</h2>
                    <p style={{ color: "#475569" }}>Your interview responses are used exclusively to evaluate rubric scoring, generate coaching guidance, and improve your preparation feedback.</p>
                </div>
                <div>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>3. Data Protection & Security</h2>
                    <p style={{ color: "#475569" }}>Zero and One Solutions Limited implements standard encryption and data safeguards to keep your personal data secure.</p>
                </div>
            </section>
        </div>
    );
}
