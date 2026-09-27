import Link from "next/link";

export default function NotFound() {
    return (
        <div
            style={{
                minHeight: "100dvh",
                display: "flex",
                flexDirection: "column",
                background: "#FFFFFF",
                color: "#141414",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                WebkitFontSmoothing: "antialiased",
            } as React.CSSProperties}
        >
            {/* Minimal nav – matches landing/dashboard spec */}
            <header
                style={{
                    height: "58px",
                    borderBottom: "1px solid #EAEAEA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 1.5rem",
                    maxWidth: 1280,
                    width: "100%",
                    margin: "0 auto",
                    boxSizing: "border-box",
                }}
            >
                <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.85rem", textDecoration: "none", color: "#141414" }}>
                    <span
                        style={{
                            width: 25,
                            height: 25,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transform: "translateY(1px)",
                            overflow: "visible",
                        }}
                    >
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                            alt="get prepped"
                            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", transform: "scale(1.32)" }}
                        />
                    </span>
                    <span style={{ fontSize: "1.02rem", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1 }}>get prepped</span>
                </Link>
                <Link
                    href="/"
                    style={{
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: "#475569",
                        textDecoration: "none",
                    }}
                >
                    Back to home
                </Link>
            </header>

            <main
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "3rem 1.5rem",
                    textAlign: "center",
                }}
            >
                <div style={{ maxWidth: 560, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.15rem" }}>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            background: "#EFF6FF",
                            border: "1px solid #BFDBFE",
                            color: "#1D4ED8",
                            padding: "0.35rem 0.75rem",
                            borderRadius: 9999,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                        }}
                    >
                        404 — Without consent
                    </div>

                    <h1
                        style={{
                            fontSize: "clamp(3.2rem, 10vw, 6rem)",
                            fontWeight: 900,
                            lineHeight: 0.9,
                            letterSpacing: "-0.05em",
                            textTransform: "uppercase",
                            margin: 0,
                            color: "#0F172A",
                        }}
                    >
                        PAGE <span style={{ color: "#4782F6" }}>NOT</span>
                        <br />
                        FOUND.
                    </h1>

                    <p style={{ fontSize: "1rem", color: "#475569", lineHeight: 1.6, margin: 0, maxWidth: 420 }}>
                        This page doesn&apos;t exist — or you don&apos;t have access without consent. If you followed a link, it may have moved or requires login.
                    </p>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem" }}>
                        <Link
                            href="/"
                            style={{
                                background: "#4782F6",
                                color: "#FFFFFF",
                                padding: "0.85rem 1.6rem",
                                borderRadius: 9999,
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                boxShadow: "0 4px 14px rgba(71,130,246,0.25)",
                            }}
                        >
                            Go to home
                        </Link>
                        <Link
                            href="/login"
                            style={{
                                background: "#FFFFFF",
                                color: "#0F172A",
                                border: "1px solid #E2E8F0",
                                padding: "0.85rem 1.6rem",
                                borderRadius: 9999,
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                            }}
                        >
                            Log in
                        </Link>
                    </div>

                    <p style={{ fontSize: "0.78rem", color: "#94A3B8", margin: "0.75rem 0 0" }}>
                        Error code: 404 • If you believe this is a mistake, contact support.
                    </p>
                </div>
            </main>

            <footer
                style={{
                    borderTop: "1px solid #F1F5F9",
                    padding: "1rem 1.5rem",
                    textAlign: "center",
                    fontSize: "0.78rem",
                    color: "#94A3B8",
                    background: "#FFFFFF",
                }}
            >
                © 2026 get prepped — Reliable practice for the world&apos;s most important interviews.
            </footer>
        </div>
    );
}
