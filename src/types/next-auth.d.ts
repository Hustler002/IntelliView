import "next-auth";
import "next-auth/jwt";

/**
 * Extend NextAuth's built-in types to include our custom fields.
 * Without this, TypeScript won't know about `session.user.id` or
 * `session.user.needsOnboarding`.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      needsOnboarding: boolean;
    };
  }

  interface User {
    id: string;
    needsOnboarding?: boolean;
    mongoId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    needsOnboarding: boolean;
  }
}
