import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export interface QuestionItem {
    id: string;
    role_family: string;
    sub_type?: string;
    question: string;
    category: string;
    applies_to_all?: boolean;
    source?: string;
}

const QUESTIONS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "questionBank.json");

async function readQuestions(): Promise<QuestionItem[]> {
    try {
        const data = await fs.readFile(QUESTIONS_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveQuestions(questions: QuestionItem[]) {
    await fs.writeFile(QUESTIONS_FILE_PATH, JSON.stringify(questions, null, 2), "utf-8");
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const roleFamily = searchParams.get("role_family");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let questions = await readQuestions();

    if (roleFamily && roleFamily !== "all") {
        questions = questions.filter((q) => q.role_family === roleFamily);
    }
    if (category && category !== "all") {
        questions = questions.filter((q) => q.category === category);
    }
    if (search) {
        const q = search.toLowerCase();
        questions = questions.filter(
            (item) =>
                item.question.toLowerCase().includes(q) ||
                item.role_family.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q)
        );
    }

    return NextResponse.json({ questions, totalCount: questions.length });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { role_family, question, category, sub_type, applies_to_all } = body;

        if (!role_family || !question || !category) {
            return NextResponse.json(
                { error: "role_family, question, and category are required." },
                { status: 400 }
            );
        }

        const questions = await readQuestions();
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

        questions.unshift(newQuestion);
        await saveQuestions(questions);

        return NextResponse.json({ success: true, question: newQuestion }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, role_family, question, category, sub_type, applies_to_all } = body;

        if (!id || !role_family || !question || !category) {
            return NextResponse.json(
                { error: "id, role_family, question, and category are required." },
                { status: 400 }
            );
        }

        const questions = await readQuestions();
        const index = questions.findIndex((q) => q.id === id);

        if (index === -1) {
            return NextResponse.json({ error: "Question not found." }, { status: 404 });
        }

        questions[index] = {
            ...questions[index],
            role_family: role_family.trim(),
            sub_type: sub_type?.trim() || questions[index].sub_type || "all_roles",
            question: question.trim(),
            category: category.trim(),
            applies_to_all: applies_to_all !== undefined ? Boolean(applies_to_all) : questions[index].applies_to_all,
        };

        await saveQuestions(questions);

        return NextResponse.json({ success: true, question: questions[index] });
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

        let questions = await readQuestions();
        questions = questions.filter((q) => q.id !== id);
        await saveQuestions(questions);

        return NextResponse.json({ success: true, message: "Question deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
