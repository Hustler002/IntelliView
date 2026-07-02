import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/User";

/**
 * POST /api/auth/register
 *
 * Create a new credentials-based user account.
 * Validation mirrors what we check client-side, plus additional server-only checks.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    // ── Validation ─────────────────────────────────────────────
    const errors: string[] = [];

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      errors.push("Name must be at least 2 characters");
    }

    if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
      errors.push("A valid email is required");
    }

    if (
      !password ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      errors.push("Password must be at least 8 characters");
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // ── Database ───────────────────────────────────────────────
    await connectDB();

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      return NextResponse.json(
        { errors: ["An account with this email already exists"] },
        { status: 409 }
      );
    }

    // 12 rounds of bcrypt — standard recommendation for password hashing
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      authProvider: "credentials",
      needsOnboarding: true,
    });

    return NextResponse.json(
      {
        message: "Account created successfully",
        userId: user._id.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { errors: ["Something went wrong. Please try again."] },
      { status: 500 }
    );
  }
}
