import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign in",
    description: "Sign in or create your get prepped account to start practising interviews.",
    alternates: { canonical: "/login" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
