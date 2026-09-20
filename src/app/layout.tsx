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
    title: "onscript - AI Interview Training",
    description: "Comprehensive Interview Test Role-Play Training for Success",
    icons: {
        icon: "https://res.cloudinary.com/dyg7neetr/image/upload/v1789904880/Gemini_Generated_Image_k81ahgk81ahgk81a-removebg-preview_fby74s.png",
        shortcut: "https://res.cloudinary.com/dyg7neetr/image/upload/v1789904880/Gemini_Generated_Image_k81ahgk81ahgk81a-removebg-preview_fby74s.png",
        apple: "https://res.cloudinary.com/dyg7neetr/image/upload/v1789904880/Gemini_Generated_Image_k81ahgk81ahgk81a-removebg-preview_fby74s.png",
    },
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "onscript",
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
