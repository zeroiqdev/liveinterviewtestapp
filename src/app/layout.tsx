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
    themeColor: "#F4F6FA",
};

export const metadata: Metadata = {
    title: "get prepped - AI Interview Training",
    description: "Get prepared to land your next offer",
    icons: {
        icon: [
            { url: "https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png", type: "image/png" },
            { url: "/icon.png", type: "image/png" },
            { url: "/favicon.ico" },
        ],
        shortcut: "https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png",
        apple: "https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png",
    },
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "get prepped",
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
