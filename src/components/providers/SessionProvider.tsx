"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode } from "react";

/**
 * Client-side SessionProvider wrapper.
 *
 * Wraps the app in NextAuth's SessionProvider so useSession() works
 * in client components. Must be a client component itself.
 */
export default function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
