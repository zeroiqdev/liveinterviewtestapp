import type { Metadata } from "next";
import PaymentComplete from "@/components/PaymentComplete";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

export default function Page() {
    return <PaymentComplete />;
}
