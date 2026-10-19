import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { codeEmail } from "@/lib/emailTemplates";
import { receiptEmail } from "@/lib/receipts";
import { roleAddedEmail } from "@/lib/roleRequests";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Every email the app sends, with sample details, for checking how they look. */
const EMAIL_PREVIEWS = ["verify", "reset", "change-email", "receipt", "role-added"] as const;

function sample(name: string) {
    switch (name) {
        case "verify":
        case "reset":
        case "change-email":
            return codeEmail(name, "483920", 10);
        case "receipt":
            return receiptEmail(
                { reference: "gp_sample_7f3a9c", label: "1-Week Bundle", passes: 7, amount: 6500, currency: "NGN", paidAt: new Date(), name: "Amara Okafor", email: "amara@example.test" },
                `${SITE_URL}/payment/receipt/gp_sample_7f3a9c`
            );
        case "role-added":
            return roleAddedEmail({ requested: "Supply chain analyst", role: "Supply Chain Analyst", siteUrl: SITE_URL });
        default:
            return null;
    }
}

/** GET /api/admin/email-preview?name=receipt — the email as HTML (or ?format=text). Admins only. */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const params = new URL(req.url).searchParams;
    const email = sample(params.get("name") || "");
    if (!email) return NextResponse.json({ emails: EMAIL_PREVIEWS }, { status: 404 });
    if (params.get("format") === "text") {
        return new NextResponse(`Subject: ${email.subject}\n\n${email.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
