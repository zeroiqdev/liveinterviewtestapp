import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Jobs",
    description: "Find job openings that fit you, then practise the interview for each one.",
    alternates: { canonical: "/jobs" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
