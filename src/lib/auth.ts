import type { NextAuthOptions, Session, User as NextAuthUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/connection";
import UserModel from "@/lib/db/models/User";

/**
 * NextAuth configuration.
 *
 * Design decisions:
 * - JWT strategy (not database sessions) — simpler, stateless, works well with
 *   Next.js middleware for route protection.
 * - Two providers: credentials (email+password) for local dev/testing, Google OAuth
 *   for production convenience.
 * - On first sign-in (either provider), we create a User document with
 *   needsOnboarding=true so the middleware can redirect to /onboarding.
 */

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        await connectDB();

        // +passwordHash: explicitly select the field we excluded by default
        const user = await UserModel.findOne({ email: credentials.email })
          .select("+passwordHash")
          .lean();

        if (!user) {
          throw new Error("No account found with this email");
        }

        if (!user.passwordHash) {
          throw new Error(
            "This account uses Google sign-in. Please sign in with Google."
          );
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!isValid) {
          throw new Error("Invalid password");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          needsOnboarding: user.needsOnboarding,
        };
      },
    }),

    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors to login page
  },

  callbacks: {
    /**
     * signIn callback — handles first-time Google OAuth sign-ups.
     * For credentials, the user is already created in the register route.
     */
    async signIn({ user, account }): Promise<boolean> {
      if (account?.provider === "google") {
        if (!user.email) return false; // OAuth without email — reject

        await connectDB();

        const existingUser = await UserModel.findOne({ email: user.email });

        if (!existingUser) {
          // First-time Google sign-in — create user document
          const newUser = await UserModel.create({
            name: user.name || "User",
            email: user.email,
            authProvider: "google",
            needsOnboarding: true,
          });
          // Attach the MongoDB _id so the jwt callback can use it
          (user as NextAuthUser & { mongoId: string }).mongoId =
            newUser._id.toString();
        } else {
          (user as NextAuthUser & { mongoId: string }).mongoId =
            existingUser._id.toString();
        }
      }
      return true;
    },

    /**
     * jwt callback — embed our custom fields into the JWT token.
     * This runs on every token refresh, but the DB lookup only happens
     * on first sign-in (when `user` is present).
     */
    async jwt({
      token,
      user,
      trigger,
    }: {
      token: JWT;
      user?: NextAuthUser & { mongoId?: string; needsOnboarding?: boolean };
      trigger?: string;
    }): Promise<JWT> {
      if (user) {
        // Initial sign-in
        if (user.mongoId) {
          token.userId = user.mongoId;
        } else {
          token.userId = user.id;
        }
        token.needsOnboarding = user.needsOnboarding ?? true;
      }

      // Allow updating the session (e.g., after onboarding completes)
      if (trigger === "update") {
        await connectDB();
        const dbUser = await UserModel.findById(token.userId).lean();
        if (dbUser) {
          token.needsOnboarding = dbUser.needsOnboarding;
        }
      }

      return token;
    },

    /**
     * session callback — expose our custom fields to the client.
     */
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      if (session.user) {
        (session.user as Session["user"] & { id: string }).id =
          token.userId as string;
        (
          session.user as Session["user"] & { needsOnboarding: boolean }
        ).needsOnboarding = token.needsOnboarding as boolean;
      }
      return session;
    },
  },
};
