import type { Metadata, Viewport } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { InterviewProvider } from "@/context/InterviewContext";
import DashboardLayout from "@/components/DashboardLayout";

const inter = Inter({ subsets: ["latin"] });
const ebGaramond = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond" });

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    themeColor: "#000000",
};

export const metadata: Metadata = {
    title: "useladder - AI Interview Training",
    description: "Comprehensive Interview Test Role-Play Training for Success",
    icons: {
        icon: "/useladder_logo.png",
        shortcut: "/useladder_logo.png",
        apple: "/useladder_logo.png",
    },
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "useladder",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} ${ebGaramond.variable}`}>
                <InterviewProvider>
                    <DashboardLayout>
                        {children}
                    </DashboardLayout>
                </InterviewProvider>
            </body>
        </html>
    );
}
