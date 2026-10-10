import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The preview card shown when a link to the site is shared (WhatsApp, X,
// LinkedIn, Slack…). One image for every page.
export const alt = "get prepped — Mock interviews with real follow-up questions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 72,
                    background: "#0B1220",
                    color: "#FFFFFF",
                    fontFamily: "sans-serif",
                }}
            >
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
                        Big career moves start with showing up prepared.
                    </div>
                    <div style={{ display: "flex", fontSize: 34, color: "#A9B8D4", maxWidth: 940, lineHeight: 1.3 }}>
                        Practice interviews with a recruiter who asks real follow-up questions.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, color: "#7FA4FF" }}>
                    <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: "#3B82F6" }} />
                    Mock interviews · instant coach feedback
                </div>
            </div>
        ),
        size
    );
}
