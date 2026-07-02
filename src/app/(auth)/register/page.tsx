"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Lock, Eye, EyeOff, User, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setIsLoading(true);

    try {
      // 1. Register the user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors(data.errors || ["Registration failed"]);
        return;
      }

      // 2. Auto sign-in after successful registration
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setErrors([signInResult.error]);
      } else {
        router.push("/onboarding");
        router.refresh();
      }
    } catch {
      setErrors(["Something went wrong. Please try again."]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel: Branding (same as login) ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-amber-500 blur-[120px]" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-navy-400 blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-navy-950" />
            </div>
            <h1 className="text-3xl font-bold text-white">IntelliView</h1>
          </div>

          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Your next interview,
            <span className="text-amber-500"> prepared with precision.</span>
          </h2>

          <p className="text-navy-300 text-lg leading-relaxed">
            Create an account to start practicing with AI-generated questions
            tailored to your actual resume and the role you&apos;re targeting.
          </p>

          {/* Stats/social proof */}
          <div className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: "10+", label: "Question types" },
              { value: "3", label: "Score dimensions" },
              { value: "∞", label: "Practice sessions" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-bold text-amber-500">
                  {stat.value}
                </p>
                <p className="text-xs text-navy-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel: Register Form ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-navy-950">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-navy-950" />
            </div>
            <span className="text-xl font-bold text-white">IntelliView</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            Create your account
          </h2>
          <p className="text-navy-400 mb-8">
            Start preparing for your next interview
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.length > 0 && (
              <div className="p-3 rounded-lg bg-alert/10 border border-alert/20 text-alert text-sm space-y-1 animate-fade-in">
                {errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-navy-200 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  minLength={2}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-navy-800/50 border border-navy-600 text-sm text-navy-100 placeholder-navy-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-navy-200 mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-navy-800/50 border border-navy-600 text-sm text-navy-100 placeholder-navy-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-navy-200 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-navy-800/50 border border-navy-600 text-sm text-navy-100 placeholder-navy-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-300 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-navy-500 mt-1.5">
                Must be at least 8 characters
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-navy-400 mt-6">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-amber-500 hover:text-amber-400 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
