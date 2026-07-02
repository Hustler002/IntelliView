import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Root page — landing redirect.
 *
 * Authenticated users → /dashboard
 * Unauthenticated users → /login
 *
 * In a future module, this could be a marketing landing page.
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
