"use client";

import React from "react";
import {
    House,
    ChatCenteredText,
    Clock,
    FileText,
    Gear,
    SignOut,
    User,
    List,
    CaretRight,
    Bell,
    MagnifyingGlass,
    Plus
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = React.useState<any>(null);

    React.useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (raw) {
            try { setUser(JSON.parse(raw)); } catch {}
        }
    }, []);

    const userName = user?.name || (user?.email ? user.email.split("@")[0] : "User");
    const userEmail = user?.email || "hello@useladder.com";
    const initials = userName.slice(0, 2).toUpperCase();

    if (pathname === "/" || pathname === "/onboarding" || pathname === "/login" || pathname === "/dashboard" || pathname === "/interview" || pathname === "/feedback" || pathname === "/admin" || pathname === "/jobs") {
        return <>{children}</>;
    }

    const sidebarItems = [
        { icon: House, label: "Home", href: "/" },
        { icon: ChatCenteredText, label: "Assessment", href: "/interview" },
        { icon: FileText, label: "Scripts", href: "/scripts" }, // Placeholder
        { icon: Clock, label: "History", href: "/history" }, // Placeholder
        { icon: Gear, label: "Settings", href: "/settings" }, // Placeholder
    ];

    return (
        <div className="flex min-h-screen bg-white">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10 hidden md:flex">
                {/* Logo */}
                <div className="p-6 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#4782F6] flex items-center justify-center text-white font-bold">L</div>
                    <span className="text-xl font-bold text-gray-900 tracking-tight">useladder</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 space-y-1">
                    <div className="px-2 py-3">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">General</h3>
                        {sidebarItems.slice(0, 2).map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-link ${pathname === item.href ? "bg-gray-50 text-[#4782F6]" : ""}`}
                            >
                                <item.icon size={20} className={pathname === item.href ? "text-[#4782F6]" : "text-gray-400"} />
                                {item.label}
                            </Link>
                        ))}
                    </div>

                    <div className="px-2 py-3 mt-4">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Library</h3>
                        {sidebarItems.slice(2).map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-link ${pathname === item.href ? "bg-gray-50 text-[#4782F6]" : ""}`}
                            >
                                <item.icon size={20} className={pathname === item.href ? "text-[#4782F6]" : "text-gray-400"} />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </nav>

                {/* User Profile */}
                <div className="p-4 border-t border-gray-200">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] flex items-center justify-center text-[#4782F6] font-bold">
                                {initials}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                                <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                            </div>
                        </div>
                        <button className="w-full bg-black text-white text-sm py-2 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors mb-2">
                            <Plus size={16} /> Add Account
                        </button>
                        <button 
                            onClick={() => {
                                localStorage.removeItem("useladder_user");
                                router.push("/");
                            }}
                            className="w-full bg-white text-gray-700 text-sm py-2 rounded-lg font-medium flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            <SignOut size={16} /> Logout
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen">

                {/* Header */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-10">
                    {/* Breadcrumbs / Search */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50">
                            <CaretRight size={16} />
                        </div>
                        <span className="font-medium text-gray-900">Interview Test Assessment</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button className="bg-[#4782F6] hover:bg-[#3B71E8] text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Share
                        </button>
                        <button className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50">
                            <Bell size={18} />
                        </button>
                        <button className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50">
                            <Gear size={18} />
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-8 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
