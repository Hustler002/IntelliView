"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  LayoutDashboard,
  Upload,
  History,
  LogOut,
  Menu,
  X,
  ChevronRight,
  User,
} from "lucide-react";

/**
 * Protected layout — wraps all authenticated pages with a sidebar nav.
 *
 * Sidebar is fixed on desktop, slides in as an overlay on mobile.
 * Collapses/expands are animated for polish.
 */

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/upload",
    label: "New Interview",
    icon: Upload,
  },
  {
    href: "/sessions",
    label: "Past Sessions",
    icon: History,
    disabled: true, // Future module — visible but greyed out
  },
];

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy-950 flex">
      {/* ── Mobile Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-navy-900 border-r border-navy-800
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-5 border-b border-navy-800">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-navy-950" />
              </div>
              <span className="text-lg font-bold text-white">IntelliView</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-navy-400 hover:text-white cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.disabled ? "#" : item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-150 group
                    ${
                      item.disabled
                        ? "opacity-40 cursor-not-allowed"
                        : isActive
                          ? "bg-amber-500/10 text-amber-500"
                          : "text-navy-300 hover:bg-navy-800 hover:text-navy-100"
                    }
                  `}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span>{item.label}</span>
                  {isActive && (
                    <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                  )}
                  {item.disabled && (
                    <span className="ml-auto text-[10px] text-navy-500 uppercase tracking-wider">
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-navy-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-navy-700 flex items-center justify-center">
                <User className="w-4 h-4 text-navy-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy-100 truncate">
                  {session?.user?.name || "User"}
                </p>
                <p className="text-xs text-navy-500 truncate">
                  {session?.user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-navy-400 hover:text-alert hover:bg-alert/5 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-navy-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-navy-300 hover:text-white cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-navy-950" />
            </div>
            <span className="text-sm font-bold text-white">IntelliView</span>
          </div>
          <div className="w-5" /> {/* Spacer for centering */}
        </header>

        <div className="flex-1 p-6 lg:p-10 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
