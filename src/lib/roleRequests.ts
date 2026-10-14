/** Emails for role requests: telling people the role they asked for is now on get prepped. */

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function roleAddedEmail(opts: { requested: string; role: string; siteUrl: string }): { subject: string; text: string; html: string } {
    const { role, siteUrl } = opts;
    const named = opts.requested.trim().toLowerCase() === role.toLowerCase() ? role : `${role} (you asked for ${opts.requested.trim()})`;
    const tryUrl = `${siteUrl}/try`;
    const text = [
        "Hi,",
        "",
        `You asked us to add ${named} to get prepped. It's here now.`,
        "",
        "Paste a job description you're applying to and answer two questions written for that job. No account needed to start:",
        tryUrl,
        "",
        "get prepped",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F4F6FA;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
<tr><td style="background:#4782F6;padding:22px 28px;color:#FFFFFF;">
<div style="font-size:15px;">get prepped</div>
<div style="margin-top:14px;font-size:24px;font-weight:600;letter-spacing:-0.02em;">${escapeHtml(role)} is here</div>
</td></tr>
<tr><td style="padding:24px 28px 8px;">
<p style="margin:0 0 10px;font-size:15px;">Hi,</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#334155;">You asked us to add ${escapeHtml(named)} to get prepped. It&rsquo;s here now.</p>
<p style="margin:0;font-size:15px;line-height:1.55;color:#334155;">Paste a job description you&rsquo;re applying to and answer two questions written for that job. No account needed to start.</p>
</td></tr>
<tr><td style="padding:18px 28px 28px;">
<a href="${escapeHtml(tryUrl)}" style="display:inline-block;background:#4782F6;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:8px;">Practise for a job</a>
</td></tr>
</table>
<p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#94A3B8;text-align:center;">You're getting this because you asked to hear when ${escapeHtml(opts.requested.trim())} was added.</p>
</body></html>`;
    return { subject: `${role} is now on get prepped`, text, html };
}
