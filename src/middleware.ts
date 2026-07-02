import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Route protection middleware.
 *
 * - Unauthenticated users hitting protected routes → redirect to /login
 * - Authenticated users with needsOnboarding=true → redirect to /onboarding
 *   (except when they're already on /onboarding)
 * - Auth pages (/login, /register) are NOT protected — unauthenticated access is fine
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // If user needs onboarding and isn't already there, redirect
    if (
      token?.needsOnboarding &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api")
    ) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true to allow the middleware function above to run,
      // return false to redirect to the sign-in page
      authorized: ({ token }) => !!token,
    },
  }
);

// Only protect these routes — auth pages and public pages are excluded
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/upload/:path*",
    "/interview/:path*",
    "/onboarding/:path*",
  ],
};
