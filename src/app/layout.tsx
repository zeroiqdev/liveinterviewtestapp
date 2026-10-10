import type { Metadata, Viewport } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { InterviewProvider } from "@/context/InterviewContext";
import DashboardLayout from "@/components/DashboardLayout";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });
const ebGaramond = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond" });

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    themeColor: "#F4F6FA",
};

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    // Pages set a short title ("Pricing"); the site name is appended.
    title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
        "mock interview",
        "interview practice",
        "interview preparation",
        "mock interview with feedback",
        "interview coach",
        "job interview questions",
        "interview practice Nigeria",
    ],
    openGraph: {
        type: "website",
        siteName: SITE_NAME,
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
    },
    robots: { index: true, follow: true },
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
