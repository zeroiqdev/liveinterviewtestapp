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
    { id: "role_001", title: "Software Engineer", domain: "Software & Engineering" },
    { id: "role_002", title: "Frontend Developer", domain: "Software & Engineering" },
    { id: "role_003", title: "Backend Engineer", domain: "Software & Engineering" },
    { id: "role_004", title: "Full Stack Developer", domain: "Software & Engineering" },
    { id: "role_005", title: "DevOps / SRE", domain: "Software & Engineering" },
    { id: "role_006", title: "Cloud Solutions Architect", domain: "Software & Engineering" },
    { id: "role_007", title: "Product Manager", domain: "Product & Strategy" },
    { id: "role_008", title: "Data Scientist", domain: "Data & Analytics" },
    { id: "role_009", title: "Data Analyst", domain: "Data & Analytics" },
    { id: "role_010", title: "Banking & Finance", domain: "Banking & Finance" },
    { id: "role_011", title: "Investment Banker", domain: "Banking & Finance" },
    { id: "role_012", title: "Financial Analyst", domain: "Banking & Finance" },
    { id: "role_013", title: "Sales & Business Development", domain: "Sales & Commercial" },
    { id: "role_014", title: "Account Executive", domain: "Sales & Commercial" },
    { id: "role_015", title: "Customer Service Representative", domain: "Customer Service & Support" },
    { id: "role_016", title: "Virtual Assistant", domain: "Administrative & Support" },
    { id: "role_017", title: "Executive Assistant", domain: "Administrative & Support" },
    { id: "role_018", title: "Engineering — Oil & Gas", domain: "Engineering & Energy" },
    { id: "role_019", title: "HSE / Safety Officer", domain: "Engineering & Energy" },
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
