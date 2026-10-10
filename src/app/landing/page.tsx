import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

// Same page as the home page: point search engines at "/" so the two don't
// compete as duplicates.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Landing() {
    return <LandingPage />;
}
