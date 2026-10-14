import type { Metadata } from "next";
import TryInterview from "@/components/TryInterview";

export const metadata: Metadata = {
    title: "Practise for a job you're applying to | get prepped",
    description: "Paste a job description and answer two interview questions written for that job. No account needed to start.",
};

export default function TryPage() {
    return <TryInterview />;
}
