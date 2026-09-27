import { NextResponse } from "next/server";
import { getRoles, saveRole, deleteRole } from "@/lib/adminStorage";

export interface RoleItem {
    id: string;
    title: string;
    domain: string;
}

export async function GET() {
    const roles = await getRoles();
    return NextResponse.json({ roles });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, domain } = body;

        if (!title || !domain) {
            return NextResponse.json({ error: "Title and Domain are required." }, { status: 400 });
        }

        const roles = await getRoles();
        const maxNum = roles.reduce((max, r) => {
            const match = r.id.match(/^role_(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                return num > max ? num : max;
            }
            return max;
        }, 0);
        const nextId = `role_${String(maxNum + 1).padStart(3, "0")}`;

        const newRole: RoleItem = {
            id: nextId,
            title: title.trim(),
            domain: domain.trim(),
        };

        await saveRole(newRole);

        return NextResponse.json({ success: true, role: newRole }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, title, domain } = body;

        if (!id || !title || !domain) {
            return NextResponse.json({ error: "ID, Title, and Domain are required." }, { status: 400 });
        }

        const roles = await getRoles();
        const existing = roles.find((r) => r.id === id);

        if (!existing) {
            return NextResponse.json({ error: "Role not found." }, { status: 404 });
        }

        const updatedRole: RoleItem = { id, title: title.trim(), domain: domain.trim() };
        await saveRole(updatedRole);

        return NextResponse.json({ success: true, role: updatedRole });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        await deleteRole(id);

        return NextResponse.json({ success: true, message: "Role deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
