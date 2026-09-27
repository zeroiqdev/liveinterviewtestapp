import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import dbConnect from "@/lib/mongodb";
import AppConfig from "@/models/AppConfig";

const FLAG_PATH = path.join(process.cwd(), "src", "engine", "data", "adminTips.json");

async function readFlag(): Promise<boolean> {
  try {
    await dbConnect();
    const doc = await AppConfig.findOne({ key: "admin_tips_enabled" }).lean();
    if (doc) {
      return !!doc.value;
    }
  } catch {
    // Fall back to reading file
  }

  try {
    const raw = await fs.readFile(FLAG_PATH, "utf-8");
    const j = JSON.parse(raw);
    return !!j.enabled;
  } catch {
    return false;
  }
}

async function writeFlag(v: boolean) {
  try {
    await dbConnect();
    await AppConfig.findOneAndUpdate(
      { key: "admin_tips_enabled" },
      { $set: { value: v } },
      { upsert: true }
    );
  } catch (err) {
    console.warn("[admin/tips] Failed to save config to DB:", err);
  }

  try {
    await fs.writeFile(
      FLAG_PATH,
      JSON.stringify({ enabled: v, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
  } catch {
    // Ignored in read-only production environments
  }
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
