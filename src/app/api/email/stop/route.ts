import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { emailFromOptOut } from "@/lib/emailOptOut";
import { escapeHtml } from "@/lib/emailLayout";

export const dynamic = "force-dynamic";

function page(title: string, body: string): NextResponse {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | get prepped</title></head>
<body style="margin:0;padding:48px 16px;background:#F4F6FA;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A;">
<main style="max-width:460px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-top:4px solid #4782F6;border-radius:0 0 14px 14px;padding:28px 28px 30px;">
<h1 style="margin:0 0 10px;font-size:22px;font-weight:500;">${escapeHtml(title)}</h1>${body}</main></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(text)}</p>`;

/** GET /api/email/stop?e=&t= — asks to confirm (mail apps open links on their own to scan them). */
export async function GET(req: NextRequest) {
    const params = new URL(req.url).searchParams;
    const email = emailFromOptOut(params.get("e"), params.get("t"));
    if (!email) return page("This link doesn't work", p("It may have been copied only in part. Open it again from the email."));
    return page(
        "Stop tips and reminders?",
        p(`We'll stop sending tips and reminders to ${email}. You'll still get emails about your account and payments.`) +
            `<form method="post"><button type="submit" style="padding:12px 20px;border:0;border-radius:8px;background:#4782F6;color:#FFFFFF;font:inherit;font-size:15px;font-weight:500;cursor:pointer;">Stop these emails</button></form>`
    );
}

/** POST /api/email/stop?e=&t= — turns off tips and reminders for that address. */
export async function POST(req: NextRequest) {
    const params = new URL(req.url).searchParams;
    const email = emailFromOptOut(params.get("e"), params.get("t"));
    if (!email) return page("This link doesn't work", p("It may have been copied only in part. Open it again from the email."));
    await dbConnect();
    await User.updateOne({ email }, { $set: { tipEmailsOff: true } });
    return page("Done", p("You won't get tips and reminders from get prepped any more. Emails about your account and payments will still reach you."));
}
