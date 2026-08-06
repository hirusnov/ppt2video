"use client";
import React from "react";
import { Check, Upload, Settings, Cpu, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppStep } from "@/lib/types";

interface Step {
  id: AppStep;
  label: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  { id: "upload", label: "Upload", icon: <Upload className="w-4 h-4" /> },
  { id: "script", label: "Script", icon: <FileText className="w-4 h-4" /> },
  { id: "configure", label: "Cài đặt", icon: <Settings className="w-4 h-4" /> },
  { id: "process", label: "Xử lý", icon: <Cpu className="w-4 h-4" /> },
  { id: "download", label: "Download", icon: <Download className="w-4 h-4" /> },
];

const STEP_ORDER: AppStep[] = [
  "upload",
  "script",
  "configure",
  "process",
  "download",
];

interface StepperProps {
  currentStep: AppStep;
}

export function Stepper({ currentStep }: StepperProps) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <nav aria-label="Tiến trình" className="w-full">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const isPending = idx > currentIdx;

          return (
            <React.Fragment key={step.id}>
              <li className="flex flex-col items-center gap-1.5 min-w-[52px]">
                <div
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-300",
                    isDone &&
                      "border-emerald-500 bg-emerald-500/20 text-emerald-400",
                    isActive &&
                      "border-violet-500 bg-violet-500/20 text-violet-300 shadow-lg shadow-violet-500/20",
                    isPending && "border-zinc-700 bg-zinc-800/50 text-zinc-600",
                  )}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className={cn(isActive && "animate-pulse-slow")}>
                      {step.icon}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium transition-colors duration-300 hidden sm:block",
                    isDone && "text-emerald-400",
                    isActive && "text-violet-300",
                    isPending && "text-zinc-600",
                  )}
                >
                  {step.label}
                </span>
              </li>

              {idx < STEPS.length - 1 && (
                <li
                  className={cn(
                    "flex-1 h-0.5 mx-1 mb-5 rounded transition-colors duration-500",
                    idx < currentIdx ? "bg-emerald-500/50" : "bg-zinc-800",
                  )}
                  aria-hidden
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
