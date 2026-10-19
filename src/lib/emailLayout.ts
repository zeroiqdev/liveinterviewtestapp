/**
 * The one look every get prepped email shares: the brand's blue header, plain
 * readable type, one clear button, and a footer saying why it was sent.
 *
 * Built from tables with inline styles, which is what mail apps (Gmail,
 * Outlook, Apple Mail, Yahoo) reliably show. Every email also has a plain-text
 * version for apps that don't show HTML.
 */

import { SITE_URL } from "@/lib/site";

export interface EmailButton {
    label: string;
    url: string;
}

export interface EmailRow {
    label: string;
    value: string;
    strong?: boolean;
}

export interface EmailContent {
    /** Shown after the subject in the inbox list. */
    preheader: string;
    /** The headline in the blue band. */
    title: string;
    /** A short line under the headline. */
    subtitle?: string;
    greeting?: string;
    paragraphs: string[];
    /** Numbered steps, after the paragraphs. */
    steps?: string[];
    /** A one-time code, shown large. */
    code?: string;
    /** Label/value lines, such as a receipt. */
    rows?: EmailRow[];
    button?: EmailButton;
    /** Smaller lines under the button (expiry, what to do if it wasn't you). */
    notes?: string[];
    /** Why this person got this email. */
    reason: string;
    /** A link to stop emails like this one (tips and reminders, never account or payment emails). */
    unsubscribeUrl?: string;
}

export interface RenderedEmail {
    html: string;
    text: string;
}

const COLORS = {
    page: "#F4F6FA",
    card: "#FFFFFF",
    border: "#E2E8F0",
    brand: "#4782F6",
    ink: "#0F172A",
    body: "#334155",
    muted: "#64748B",
    faint: "#94A3B8",
    soft: "#F1F5F9",
};
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The logo, from the live site: mail apps only show images from a full web address. */
function logoUrl(): string {
    return `${SITE_URL.replace(/\/$/, "")}/icon-192.png`;
}

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function contactLine(): string {
    const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
    return contact ? `Questions? Write to ${contact}.` : "";
}

export function renderEmail(content: EmailContent): RenderedEmail {
    const e = escapeHtml;
    const paragraph = (text: string, last = false) =>
        `<p style="margin:0 0 ${last ? 0 : 12}px;font-size:15px;line-height:1.6;color:${COLORS.body};">${e(text)}</p>`;

    const steps = content.steps?.length
        ? `<tr><td style="padding:14px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${content.steps
    .map(
        (step, i) =>
            `<tr><td style="width:28px;vertical-align:top;padding:0 0 12px;"><div style="width:22px;height:22px;border-radius:11px;background:${COLORS.soft};color:${COLORS.brand};font-size:12px;font-weight:600;line-height:22px;text-align:center;">${i + 1}</div></td><td style="vertical-align:top;padding:1px 0 12px 8px;font-size:15px;line-height:1.55;color:${COLORS.body};">${e(step)}</td></tr>`
    )
    .join("\n")}
</table>
</td></tr>`
        : "";

    const code = content.code
        ? `<tr><td style="padding:8px 32px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="background:${COLORS.soft};border:1px solid ${COLORS.border};border-radius:10px;padding:14px 22px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:30px;font-weight:600;letter-spacing:8px;color:${COLORS.ink};">${e(content.code)}</td></tr></table>
</td></tr>`
        : "";

    const rows = content.rows?.length
        ? `<tr><td style="padding:12px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.soft};">
${content.rows
    .map(
        (r) =>
            `<tr><td style="padding:10px 0;font-size:14px;color:${COLORS.muted};${r.strong ? `border-top:1px solid ${COLORS.border};` : ""}">${e(r.label)}</td><td style="padding:10px 0;text-align:right;font-size:14px;color:${COLORS.ink};${r.strong ? `font-weight:500;border-top:1px solid ${COLORS.border};` : ""}">${e(r.value)}</td></tr>`
    )
    .join("\n")}
</table>
</td></tr>`
        : "";

    // A button made of a table cell, so it shows as a button in Outlook too.
    const button = content.button
        ? `<tr><td style="padding:20px 32px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${COLORS.brand};">
<a href="${e(content.button.url)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none;border-radius:8px;">${e(content.button.label)}</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${COLORS.faint};">Or open this link: <a href="${e(content.button.url)}" style="color:${COLORS.brand};word-break:break-all;">${e(content.button.url)}</a></p>
</td></tr>`
        : "";

    const notes = content.notes?.length
        ? `<tr><td style="padding:16px 32px 0;">${content.notes
              .map((n, i) => `<p style="margin:0 0 ${i === content.notes!.length - 1 ? 0 : 8}px;font-size:13px;line-height:1.55;color:${COLORS.muted};">${e(n)}</p>`)
              .join("")}</td></tr>`
        : "";

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:${FONT};color:${COLORS.ink};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.page};">${e(content.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:32px 12px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding-right:10px;"><img src="${e(logoUrl())}" width="30" height="30" alt="" style="display:block;width:30px;height:30px;border:0;"></td>
<td style="vertical-align:middle;font-size:17px;font-weight:500;letter-spacing:-0.02em;color:${COLORS.ink};">get prepped</td>
</tr></table>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.brand};border-radius:0 0 14px 14px;overflow:hidden;">
<tr><td style="padding:30px 32px 0;">
<h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:500;letter-spacing:-0.02em;color:${COLORS.ink};">${e(content.title)}</h1>
${content.subtitle ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.45;color:${COLORS.muted};">${e(content.subtitle)}</p>` : ""}
</td></tr>
<tr><td style="padding:22px 32px 4px;">
${content.greeting ? `<p style="margin:0 0 12px;font-size:15px;color:${COLORS.ink};">${e(content.greeting)}</p>` : ""}
${content.paragraphs.map((p, i) => paragraph(p, i === content.paragraphs.length - 1)).join("\n")}
</td></tr>
${steps}
${code}
${rows}
${button}
${notes}
<tr><td style="padding:28px 32px 0;"><div style="border-top:1px solid ${COLORS.soft};"></div></td></tr>
<tr><td style="padding:14px 32px 26px;font-size:13px;line-height:1.5;color:${COLORS.muted};">The get prepped team</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:16px 12px 0;text-align:center;font-size:12px;line-height:1.55;color:${COLORS.faint};">
${e(content.reason)}${content.unsubscribeUrl ? ` <a href="${e(content.unsubscribeUrl)}" style="color:${COLORS.faint};text-decoration:underline;">Stop these emails</a>` : ""}${contactLine() ? `<br>${e(contactLine())}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = [
        content.greeting,
        content.greeting ? "" : undefined,
        ...content.paragraphs.flatMap((p) => [p, ""]),
        ...(content.steps || []).map((step, i) => `${i + 1}. ${step}`),
        ...(content.steps?.length ? [""] : []),
        ...(content.code ? [content.code, ""] : []),
        ...(content.rows || []).map((r) => `${r.label}: ${r.value}`),
        ...(content.rows?.length ? [""] : []),
        ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
        ...(content.notes || []).flatMap((n) => [n, ""]),
        "The get prepped team",
        "",
        "—",
        content.reason,
        content.unsubscribeUrl ? `Stop these emails: ${content.unsubscribeUrl}` : "",
        contactLine(),
    ]
        .filter((line) => line !== undefined)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return { html, text };
}
