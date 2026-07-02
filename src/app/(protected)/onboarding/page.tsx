"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Upload } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Onboarding page — shown on first login.
 *
 * Simple welcome screen that directs the user to upload their resume.
 * After they complete the first upload, needsOnboarding is set to false
 * and the middleware stops redirecting here.
 */

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const handleGetStarted = async () => {
    // Mark onboarding as complete
    await fetch("/api/auth/onboarding-complete", { method: "POST" });
    await update(); // Refresh the session to get updated needsOnboarding
    router.push("/upload");
  };

  return (
    <div className="max-w-2xl mx-auto text-center animate-fade-in py-12">
      {/* Welcome icon */}
      <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-8 shadow-lg shadow-amber-500/20">
        <Sparkles className="w-10 h-10 text-navy-950" />
      </div>

      <h1 className="text-3xl font-bold text-white mb-3">
        Welcome to IntelliView, {firstName}!
      </h1>

      <p className="text-navy-300 text-lg leading-relaxed mb-4 max-w-md mx-auto">
        Let&apos;s get you ready for your next interview. Start by uploading
        your resume and the job description you&apos;re targeting.
      </p>

      <p className="text-navy-400 text-sm mb-10 max-w-sm mx-auto">
        We&apos;ll analyze both to generate interview questions that are
        tailored to your background and the role.
      </p>

      {/* Steps preview */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
        {[
          { icon: Upload, label: "Upload Resume & JD" },
          { icon: Sparkles, label: "AI Generates Questions" },
        ].map((step, i) => (
          <React.Fragment key={i}>
            <div className="flex items-center gap-2 glass-card px-4 py-2.5">
              <step.icon className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-navy-200">{step.label}</span>
            </div>
            {i < 1 && (
              <ArrowRight className="w-4 h-4 text-navy-600 hidden sm:block" />
            )}
          </React.Fragment>
        ))}
      </div>

      <Button
        variant="primary"
        size="lg"
        onClick={handleGetStarted}
        rightIcon={<ArrowRight className="w-4 h-4" />}
      >
        Get Started
      </Button>
    </div>
  );
}
