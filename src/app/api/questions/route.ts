import { NextRequest, NextResponse } from "next/server";
import { getQuestions, saveQuestion, deleteQuestion } from "@/lib/adminStorage";
import { requireAdmin } from "@/lib/session";

export interface QuestionItem {
    id: string;
    role_family: string;
    sub_type?: string;
    question: string;
    category: string;
    applies_to_all?: boolean;
    source?: string;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const roleFamily = searchParams.get("role_family");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const questions = await getQuestions({ roleFamily, category, search });

    return NextResponse.json({ questions, totalCount: questions.length });
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { role_family, question, category, sub_type, applies_to_all } = body;

        if (!role_family || !question || !category) {
            return NextResponse.json(
                { error: "role_family, question, and category are required." },
                { status: 400 }
            );
        }

        const prefix = role_family.slice(0, 3).toLowerCase();
        const newQuestion: QuestionItem = {
            id: `${prefix}_${Date.now()}`,
            role_family: role_family.trim(),
            sub_type: sub_type?.trim() || "all_roles",
            question: question.trim(),
            category: category.trim(),
            applies_to_all: Boolean(applies_to_all),
            source: "admin_added",
        };

        await saveQuestion(newQuestion);

        return NextResponse.json({ success: true, question: newQuestion }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { id, role_family, question, category, sub_type, applies_to_all } = body;

        if (!id || !role_family || !question || !category) {
            return NextResponse.json(
                { error: "id, role_family, question, and category are required." },
                { status: 400 }
            );
        }

        const existingList = await getQuestions();
        const existing = existingList.find((q) => q.id === id);

        if (!existing) {
            return NextResponse.json({ error: "Question not found." }, { status: 404 });
        }

        const updated: QuestionItem = {
            id,
            role_family: role_family.trim(),
            sub_type: sub_type?.trim() || existing.sub_type || "all_roles",
            question: question.trim(),
            category: category.trim(),
            applies_to_all: applies_to_all !== undefined ? Boolean(applies_to_all) : existing.applies_to_all,
            source: existing.source,
        };

        await saveQuestion(updated);

        return NextResponse.json({ success: true, question: updated });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        await deleteQuestion(id);

        return NextResponse.json({ success: true, message: "Question deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
