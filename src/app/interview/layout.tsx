import type { Metadata } from "next";

// A signed-in area: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
