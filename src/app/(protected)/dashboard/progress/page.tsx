"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { scoreDelta } from "@/lib/scoring";

/**
 * Progress page — cross-session view showing score trends over time.
 *
 * Features:
 *   - Session history table with "vs. last attempt" deltas
 *   - Recharts line chart of overall score over time
 *   - Filterable by JD role (if multiple roles practiced)
 *   - No bare numbers — every score shows context
 */

interface SessionEntry {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  role: string;
  seniority: string;
  overallScore: number | null;
}

const DeltaBadge = ({
  delta,
}: {
  delta: ReturnType<typeof scoreDelta>;
}) => {
  const colors = {
    up: "text-success",
    down: "text-alert",
    same: "text-navy-400",
    first: "text-navy-500",
  };
  const icons = {
    up: <TrendingUp className="w-3 h-3" />,
    down: <TrendingDown className="w-3 h-3" />,
    same: <Minus className="w-3 h-3" />,
    first: null,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${colors[delta.direction]}`}
    >
      {icons[delta.direction]}
      {delta.text}
    </span>
  );
};

export default function ProgressPage() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/sessions");
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load sessions");
          return;
        }
        setSessions(json.sessions);
      } catch {
        setError("Network error. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  // Unique roles for the filter
  const roles = useMemo(() => {
    const uniqueRoles = [...new Set(sessions.map((s) => s.role))];
    return uniqueRoles.filter((r) => r !== "Unknown");
  }, [sessions]);

  // Filtered + completed sessions (for chart/table)
  const completedSessions = useMemo(() => {
    return sessions
      .filter((s) => s.status === "completed" && s.overallScore !== null)
      .filter((s) => roleFilter === "all" || s.role === roleFilter)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }, [sessions, roleFilter]);

  // Chart data
  const chartData = useMemo(() => {
    return completedSessions.map((s, i) => ({
      name: new Date(s.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: s.overallScore!,
      role: s.role,
      attempt: i + 1,
    }));
  }, [completedSessions]);

  // Session history with deltas (descending order)
  const sessionHistory = useMemo(() => {
    const sorted = [...completedSessions].reverse(); // most recent first
    return sorted.map((s, i) => {
      const previousScore =
        i < sorted.length - 1 ? sorted[i + 1].overallScore : null;
      const delta = scoreDelta(s.overallScore!, previousScore);
      return { ...s, delta };
    });
  }, [completedSessions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <AlertCircle className="w-12 h-12 text-alert mx-auto mb-4" />
        <p className="text-navy-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-navy-400 hover:text-navy-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Progress</h1>
          <p className="text-sm text-navy-400">
            Track your interview performance over time
          </p>
        </div>
      </div>

      {/* Role filter */}
      {roles.length > 1 && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-navy-500">Filter by role:</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setRoleFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                roleFilter === "all"
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-navy-800 text-navy-400 hover:text-navy-200"
              }`}
            >
              All roles
            </button>
            {roles.map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  roleFilter === role
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-navy-800 text-navy-400 hover:text-navy-200"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {completedSessions.length === 0 && (
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-10 h-10 text-navy-500 mx-auto mb-3" />
          <p className="text-navy-300 font-medium mb-1">No completed sessions yet</p>
          <p className="text-sm text-navy-500">
            Complete an interview to see your progress here.
          </p>
        </div>
      )}

      {/* Score over time chart */}
      {chartData.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <h3 className="text-sm text-navy-500 uppercase tracking-wider font-medium mb-4">
            Score Over Time
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1B2A4A"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#5A7A9A", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1B2A4A" }}
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fill: "#5A7A9A", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1B2A4A" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F1A2E",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "#E8E8E8",
                    fontSize: "13px",
                  }}
                  formatter={(value) => [
                    `${value}/10`,
                    "Overall Score",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#E8A33D"
                  strokeWidth={2.5}
                  dot={{
                    fill: "#E8A33D",
                    stroke: "#0F1A2E",
                    strokeWidth: 2,
                    r: 5,
                  }}
                  activeDot={{ r: 7, stroke: "#E8A33D", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Session history table */}
      {sessionHistory.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="text-sm text-navy-500 uppercase tracking-wider font-medium">
              Session History
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {sessionHistory.map((s) => (
              <Link
                key={s.id}
                href={`/interview/${s.id}/results`}
                className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {s.role}
                  </p>
                  <p className="text-xs text-navy-500">
                    {new Date(s.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <span className="text-sm font-semibold text-amber-500">
                  {s.overallScore}/10
                </span>

                <DeltaBadge delta={s.delta} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
