import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ClientLog from "@/models/ClientLog";
import { getSession } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const KINDS = new Set(["voice-unlock-failed", "voice-play-refused", "voice-paused-by-browser", "voice-shown-as-text"]);

/** POST /api/client-log — { kind, detail }: a browser-side problem worth knowing about. Never fails loudly. */
export async function POST(req: NextRequest) {
    try {
        const limited = await rateLimit(LIMITS.clientLog, `ip:${clientIp(req)}`);
        if (limited) return limited;
        const body = await req.json().catch(() => ({}));
        if (typeof body.kind !== "string" || !KINDS.has(body.kind)) return NextResponse.json({ ok: false }, { status: 400 });
        // Small and flat: names, numbers and short strings only.
        const detail: Record<string, unknown> = {};
        if (body.detail && typeof body.detail === "object") {
            for (const [key, value] of Object.entries(body.detail as Record<string, unknown>).slice(0, 12)) {
                if (typeof value === "number" || typeof value === "boolean") detail[key.slice(0, 40)] = value;
                else if (typeof value === "string") detail[key.slice(0, 40)] = value.slice(0, 200);
            }
        }
        const session = await getSession(req);
        await dbConnect();
        await ClientLog.create({ kind: body.kind, detail, userAgent: (req.headers.get("user-agent") || "").slice(0, 300), email: session?.email ?? null });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false });
    }
}
