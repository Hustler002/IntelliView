"use client";

import React from "react";
import { Mic, AlertCircle, Settings } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * MicPermissionGate — pre-permission explainer shown BEFORE the
 * browser's native microphone prompt.
 *
 * Candidates should understand WHY they're granting mic access
 * before the OS dialog appears. This also handles the denied state
 * with clear instructions on how to fix it.
 */

interface MicPermissionGateProps {
  onAllow: () => void;
  error: string | null;
  isRequesting: boolean;
}

export default function MicPermissionGate({
  onAllow,
  error,
  isRequesting,
}: MicPermissionGateProps) {
  const isDenied = error?.includes("denied");

  return (
    <div className="max-w-md mx-auto text-center py-12 animate-fade-in">
      <div
        className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-6 ${
          isDenied ? "bg-alert/10" : "bg-amber-500/10"
        }`}
      >
        {isDenied ? (
          <AlertCircle className="w-8 h-8 text-alert" />
        ) : (
          <Mic className="w-8 h-8 text-amber-500" />
        )}
      </div>

      <h2 className="text-xl font-bold text-white mb-3">
        {isDenied ? "Microphone access denied" : "Microphone required"}
      </h2>

      {isDenied ? (
        <>
          <p className="text-navy-400 text-sm mb-4 leading-relaxed">
            IntelliView needs microphone access to record your interview
            answers. It looks like permission was denied.
          </p>

          <div className="glass-card p-4 text-left mb-6">
            <div className="flex items-start gap-3">
              <Settings className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-navy-200 mb-2">
                  How to fix this:
                </p>
                <ol className="text-xs text-navy-400 space-y-1.5 list-decimal list-inside">
                  <li>
                    Click the lock/info icon in your browser&apos;s address bar
                  </li>
                  <li>Find &quot;Microphone&quot; in the permissions list</li>
                  <li>Change it to &quot;Allow&quot;</li>
                  <li>Refresh this page</li>
                </ol>
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => window.location.reload()}
            leftIcon={<Mic className="w-4 h-4" />}
          >
            Refresh Page
          </Button>
        </>
      ) : (
        <>
          <p className="text-navy-400 text-sm mb-2 leading-relaxed">
            Your microphone will be used to record your interview answers.
          </p>
          <p className="text-navy-500 text-xs mb-6 leading-relaxed">
            Audio is uploaded securely, transcribed for evaluation, and not
            retained beyond the processing period. See our data policy in the
            README.
          </p>

          {error && !isDenied && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-alert/10 border border-alert/20 text-alert text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={onAllow}
            isLoading={isRequesting}
            leftIcon={<Mic className="w-4 h-4" />}
          >
            Allow Microphone
          </Button>
        </>
      )}
    </div>
  );
}
