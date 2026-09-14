import { NextResponse } from "next/server";
import { listBlueprints } from "@/engine/data";

export async function GET() {
    return NextResponse.json({ blueprints: listBlueprints() });
}
