import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export interface RoleItem {
    id: string;
    title: string;
    domain: string;
}

const ROLES_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "roles.json");

const DEFAULT_ROLES: RoleItem[] = [
    { id: "role_001", title: "Product Designer", domain: "Product & Design" },
    { id: "role_002", title: "Product Manager", domain: "Product & Design" },
    { id: "role_003", title: "Product Marketer", domain: "Product & Design" },
    { id: "role_004", title: "Product Engineer", domain: "Product & Design" },
    { id: "role_005", title: "Frontend Developer", domain: "Software & Engineering" },
    { id: "role_006", title: "Backend Engineer", domain: "Software & Engineering" },
    { id: "role_007", title: "Full Stack Developer", domain: "Software & Engineering" },
    { id: "role_008", title: "Data Analyst", domain: "Data & Analytics" },
    { id: "role_009", title: "Data Scientist", domain: "Data & Analytics" },
    { id: "role_010", title: "Business Analyst", domain: "Business & Operations" },
    { id: "role_011", title: "UX Researcher", domain: "Product & Design" },
    { id: "role_012", title: "DevOps / SRE", domain: "Software & Engineering" },
];

async function readRoles(): Promise<RoleItem[]> {
    try {
        const data = await fs.readFile(ROLES_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return DEFAULT_ROLES;
    }
}

async function saveRoles(roles: RoleItem[]) {
    await fs.writeFile(ROLES_FILE_PATH, JSON.stringify(roles, null, 2), "utf-8");
}

export async function GET() {
    const roles = await readRoles();
    return NextResponse.json({ roles });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, domain } = body;

        if (!title || !domain) {
            return NextResponse.json({ error: "Title and Domain are required." }, { status: 400 });
        }

        const roles = await readRoles();
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

        roles.push(newRole);
        await saveRoles(roles);

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

        const roles = await readRoles();
        const index = roles.findIndex((r) => r.id === id);

        if (index === -1) {
            return NextResponse.json({ error: "Role not found." }, { status: 404 });
        }

        roles[index] = { id, title: title.trim(), domain: domain.trim() };
        await saveRoles(roles);

        return NextResponse.json({ success: true, role: roles[index] });
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

        let roles = await readRoles();
        roles = roles.filter((r) => r.id !== id);
        await saveRoles(roles);

        return NextResponse.json({ success: true, message: "Role deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
