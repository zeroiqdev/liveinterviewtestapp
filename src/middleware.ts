import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/sessionToken";

// Paths that require an authenticated user
const PROTECTED_USER_PREFIXES = [
    "/dashboard",
    "/interview",
    "/resume-feedback",
    "/feedback",
];

// Paths that require admin privileges
const PROTECTED_ADMIN_PREFIXES = [
    "/admin",
];

// Auth pages where logged-in users shouldn't linger
const AUTH_PAGES = ["/login"];

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    const isProtectedAdminPath = PROTECTED_ADMIN_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    const isProtectedUserPath = PROTECTED_USER_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    const isAuthPath = AUTH_PAGES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    // 1. Enforce Admin Access on Admin Routes
    if (isProtectedAdminPath) {
        if (!session) {
            const loginUrl = new URL("/login", req.url);
            loginUrl.searchParams.set("redirect", pathname + search);
            return NextResponse.redirect(loginUrl);
        }
        if (!session.isAdmin) {
            const dashboardUrl = new URL("/dashboard", req.url);
            dashboardUrl.searchParams.set("error", "unauthorized_admin");
            return NextResponse.redirect(dashboardUrl);
        }
    }

    // 2. Enforce Authentication on User Routes
    if (isProtectedUserPath) {
        if (!session) {
            const loginUrl = new URL("/login", req.url);
            loginUrl.searchParams.set("redirect", pathname + search);
            return NextResponse.redirect(loginUrl);
        }
    }

    // 3. Redirect logged-in users away from /login
    if (isAuthPath && session) {
        const redirectParam = req.nextUrl.searchParams.get("redirect");
        if (redirectParam && redirectParam.startsWith("/")) {
            // Prevent non-admins from being redirected to /admin
            if (redirectParam.startsWith("/admin") && !session.isAdmin) {
                return NextResponse.redirect(new URL("/dashboard", req.url));
            }
            return NextResponse.redirect(new URL(redirectParam, req.url));
        }

        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // 4. Pass session headers down to routes
    const requestHeaders = new Headers(req.headers);
    if (session) {
        requestHeaders.set("x-user-id", session.userId);
        requestHeaders.set("x-user-email", session.email);
        requestHeaders.set("x-user-role", session.role);
        requestHeaders.set("x-is-admin", session.isAdmin ? "true" : "false");
    }

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt
         * - static file extensions (svg, png, jpg, jpeg, gif, webp, ico, mp3, mp4, etc.)
         */
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|mp4|woff2?|ttf)).*)",
    ],
};
