import { Suspense } from "react";
import RealtimeInterview from "@/components/RealtimeInterview";

export default function RealtimeInterviewPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "#ffffff" }} />}>
            <RealtimeInterview />
        </Suspense>
    );
}
