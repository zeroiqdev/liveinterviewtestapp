import { Suspense } from "react";
import InterviewTab from "@/components/InterviewTab";

export default function InterviewPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0f17" }} />}>
            <InterviewTab />
        </Suspense>
    );
}

