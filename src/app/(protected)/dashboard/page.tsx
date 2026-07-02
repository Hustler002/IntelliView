"use client";

import React from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  FileText,
  Mic,
  BarChart3,
  Plus,
} from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Dashboard — the main landing page for authenticated users.
 *
 * Shows a welcome message, quick-start CTA, and an overview of the process.
 * Past sessions list is a placeholder for Module 2.
 */

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* ── Header ── */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome back, {firstName}
        </h1>
        <p className="text-navy-400">
          Ready to sharpen your interview skills? Start a new session or review
          past performance.
        </p>
      </div>

      {/* ── Quick Start Card ── */}
      <div className="glass-card p-8 mb-10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-white">
                Start a New Interview
              </h2>
            </div>
            <p className="text-navy-300 text-sm max-w-lg">
              Upload your resume and the job description. We&apos;ll generate
              tailored questions covering HR, technical, and behavioral areas —
              then score your answers.
            </p>
          </div>

          <Link href="/upload">
            <Button
              variant="primary"
              size="lg"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              <Plus className="w-4 h-4" />
              New Session
            </Button>
          </Link>
        </div>
      </div>

      {/* ── How It Works ── */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-5">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: FileText,
              title: "1. Upload",
              description:
                "Upload your resume and paste the job description. Our AI analyzes both to understand the match.",
              color: "text-amber-500",
              bgColor: "bg-amber-500/10",
            },
            {
              icon: Mic,
              title: "2. Practice",
              description:
                "Answer tailored interview questions by voice. Questions adapt to your resume × JD pairing.",
              color: "text-blue-400",
              bgColor: "bg-blue-400/10",
            },
            {
              icon: BarChart3,
              title: "3. Review",
              description:
                "Get scored on correctness, communication, and confidence. Receive an actionable improvement plan.",
              color: "text-success",
              bgColor: "bg-success/10",
            },
          ].map((step) => (
            <div
              key={step.title}
              className="glass-card glass-card-hover p-6 transition-all duration-200"
            >
              <div
                className={`w-10 h-10 rounded-xl ${step.bgColor} flex items-center justify-center mb-4`}
              >
                <step.icon className={`w-5 h-5 ${step.color}`} />
              </div>
              <h3 className="font-semibold text-white mb-1.5">{step.title}</h3>
              <p className="text-sm text-navy-400 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Past Sessions Placeholder ── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Recent Sessions</h2>
        </div>
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-navy-800 flex items-center justify-center mb-4">
            <BarChart3 className="w-7 h-7 text-navy-500" />
          </div>
          <h3 className="text-navy-200 font-medium mb-1">
            No sessions yet
          </h3>
          <p className="text-sm text-navy-500 mb-5">
            Start your first mock interview to see your results here.
          </p>
          <Link href="/upload">
            <Button variant="secondary" size="sm">
              Start your first session
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
