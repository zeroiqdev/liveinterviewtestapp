import PricingPage from "@/components/PricingPage";

export const metadata = {
    title: "Pricing",
    description: "Simple passes for interview practice: pick a day pass, a 7-day bundle, or build your own.",
    alternates: { canonical: "/pricing" },
};

export default function Page() {
    return <PricingPage />;
}
