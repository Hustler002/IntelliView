import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/User";

/**
 * POST /api/auth/onboarding-complete
 *
 * Marks the current user's onboarding as complete.
 * Called when the user clicks "Get Started" on the onboarding page.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  await User.findByIdAndUpdate(session.user.id, { needsOnboarding: false });

  return NextResponse.json({ success: true });
}
