import type { Metadata } from "next";
import Receipt from "@/components/Receipt";

export const metadata: Metadata = { title: "Receipt | get prepped", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
    const { reference } = await params;
    return <Receipt reference={decodeURIComponent(reference)} />;
}
