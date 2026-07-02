import type { Metadata } from "next";
import { Inter } from "next/font/google";
import SessionProvider from "@/components/providers/SessionProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "IntelliView — AI-Powered Mock Interview Platform",
  description:
    "Practice the interview as if you already had the job description. Upload your resume and a JD to receive tailored interview questions, voice-recorded answer evaluation, and actionable feedback.",
  keywords: [
    "mock interview",
    "AI interview prep",
    "resume-based interview",
    "job description",
    "interview practice",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
