import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const FLAG_PATH = path.join(process.cwd(), "src", "engine", "data", "adminTips.json");

async function readFlag(): Promise<boolean> {
  try {
    const raw = await fs.readFile(FLAG_PATH, "utf-8");
    const j = JSON.parse(raw);
    return !!j.enabled;
  } catch {
    return false;
  }
}
async function writeFlag(v: boolean) {
  await fs.writeFile(FLAG_PATH, JSON.stringify({ enabled: v, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
}

export async function GET() {
  const enabled = await readFlag();
  return NextResponse.json({ enabled });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
    await writeFlag(enabled);
    return NextResponse.json({ enabled });
  } catch {
    return NextResponse.json({ error: "Failed to update flag" }, { status: 500 });
  }
}
