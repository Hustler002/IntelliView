import React from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * ProgressSteps — a three-state progress indicator for async operations.
 *
 * Used by the waiting screen to show resume parsing → JD parsing → ready.
 * Reusable for any multi-step async flow.
 */

export interface Step {
  id: string;
  label: string;
  description?: string;
  status: "pending" | "active" | "completed" | "failed";
}

interface ProgressStepsProps {
  steps: Step[];
}

export default function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="space-y-1">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-4">
          {/* Step indicator line + icon */}
          <div className="flex flex-col items-center">
            <StepIcon status={step.status} />
            {index < steps.length - 1 && (
              <div
                className={`w-0.5 h-8 mt-1 transition-colors duration-500 ${
                  step.status === "completed"
                    ? "bg-success"
                    : "bg-navy-700"
                }`}
              />
            )}
          </div>

          {/* Step content */}
          <div className="pb-6 -mt-0.5">
            <p
              className={`font-medium transition-colors duration-300 ${
                step.status === "active"
                  ? "text-amber-500"
                  : step.status === "completed"
                    ? "text-success"
                    : step.status === "failed"
                      ? "text-alert"
                      : "text-navy-400"
              }`}
            >
              {step.label}
            </p>
            {step.description && (
              <p className="text-sm text-navy-400 mt-0.5">
                {step.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  const base =
    "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300";

  switch (status) {
    case "completed":
      return (
        <div className={`${base} bg-success text-white`}>
          <Check className="w-4 h-4" />
        </div>
      );
    case "active":
      return (
        <div className={`${base} bg-amber-500/20 border-2 border-amber-500 animate-pulse-glow`}>
          <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
        </div>
      );
    case "failed":
      return (
        <div className={`${base} bg-alert/20 border-2 border-alert`}>
          <span className="text-alert text-xs font-bold">!</span>
        </div>
      );
    default: // pending
      return (
        <div className={`${base} bg-navy-800 border-2 border-navy-600`}>
          <div className="w-2 h-2 bg-navy-500 rounded-full" />
        </div>
      );
  }
}
