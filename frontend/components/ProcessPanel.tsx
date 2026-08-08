"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { backendUrl } from "@/lib/utils";
import {
  TTSSettings,
  SlideSettingsMap,
  LogLine,
  SSEEvent,
  ScriptMap,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ProgressBar";
import { LogTerminal } from "@/components/LogTerminal";
import { Confetti } from "@/components/Confetti";

function uid(): string {
  try {
    return typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

interface ProcessPanelProps {
  pptxFile: File;
  /** Script content as a map of slideIndex → narration text */
  scriptMap: ScriptMap;
  globalSettings: TTSSettings;
  slideSettingsMap: SlideSettingsMap;
  totalSlides: number;
  onDone: (jobId: string) => void;
  onError: () => void;
}

export function ProcessPanel({
  pptxFile,
  scriptMap,
  globalSettings,
  slideSettingsMap,
  totalSlides,
  onDone,
  onError,
}: ProcessPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "submitting" | "streaming" | "done" | "error"
  >("submitting");

  // Keep ref in sync so closures (SSE onerror) always see current status
  const updateStatus = useCallback(
    (s: "submitting" | "streaming" | "done" | "error") => {
      statusRef.current = s;
      setStatus(s);
    },
    [],
  );
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("queued");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [confetti, setConfetti] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  // Guard against double-submit (React Strict Mode / re-mount)
  const submittedRef = useRef(false);
  // Track status in a ref so onerror closure always reads the current value
  const statusRef = useRef<"submitting" | "streaming" | "done" | "error">(
    "submitting",
  );

  const appendLog = useCallback((event: SSEEvent) => {
    if (!event.message) return;
    setLogs((prev) => [
      ...prev,
      {
        id: uid(),
        step: event.step,
        message: event.message,
        progress: event.progress,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Submit job then open SSE stream
  useEffect(() => {
    let cancelled = false;

    // Prevent double-submit from React Strict Mode double-invoke
    if (submittedRef.current) return;
    submittedRef.current = true;

    async function submit() {
      // Build script .txt from scriptMap: "S1: text\n\nS2: text\n..."
      const scriptContent = Object.entries(scriptMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([idx, text]) => `S${idx}: ${text}`)
        .join("\n\n");
      const scriptBlob = new Blob([scriptContent], { type: "text/plain" });

      const form = new FormData();
      form.append("pptx", pptxFile);
      form.append("script", scriptBlob, "script.txt");
      form.append("settings", JSON.stringify(globalSettings));

      // Serialize slide overrides
      const overridesPayload: Record<string, unknown> = {};
      for (const [idx, override] of Object.entries(slideSettingsMap)) {
        if (override?.override) {
          overridesPayload[idx] = {
            override: true,
            settings: override.settings,
          };
        }
      }
      form.append("slide_overrides", JSON.stringify(overridesPayload));

      try {
        const res = await fetch(backendUrl("/api/process"), {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: "Lỗi không xác định" }));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setJobId(data.job_id);
        updateStatus("streaming");
        openSSE(data.job_id);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Gửi job thất bại";
        toast.error(msg);
        updateStatus("error");
        setCurrentStep("error");
        appendLog({ step: "error", message: msg, progress: 0 });
      }
    }

    submit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openSSE(id: string) {
    const url = backendUrl(`/api/process/${id}/stream`);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        setProgress(event.progress);
        setCurrentStep(event.step);
        appendLog(event);

        if (event.step === "done") {
          updateStatus("done");
          setConfetti(true);
          es.close();
          toast.success("Video đã hoàn thành! 🎉");
          setTimeout(() => setConfetti(false), 3500);
        } else if (event.step === "error") {
          updateStatus("error");
          es.close();
          toast.error(event.error || "Pipeline thất bại");
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      if (statusRef.current !== "done" && statusRef.current !== "error") {
        checkFinalStatus(id);
      }
    };
  }

  async function checkFinalStatus(id: string) {
    try {
      const res = await fetch(backendUrl(`/api/process/${id}/status`));
      const data = await res.json();
      if (data.status === "done") {
        updateStatus("done");
        setProgress(100);
        setCurrentStep("done");
        setConfetti(true);
        setTimeout(() => setConfetti(false), 3500);
      } else if (data.status === "error") {
        updateStatus("error");
        setCurrentStep("error");
        appendLog({
          step: "error",
          message: data.error || "Pipeline thất bại",
          progress: data.progress,
        });
      }
    } catch {
      // silent
    }
  }

  const handleDownload = useCallback(() => {
    if (!jobId) return;
    const url = backendUrl(`/api/process/${jobId}/download`);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ppt2video_${jobId.slice(0, 8)}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Notify parent after a brief delay (download is in progress)
    setTimeout(() => onDone(jobId), 500);
  }, [jobId, onDone]);

  const isProcessing = status === "submitting" || status === "streaming";
  const isDone = status === "done";
  const isError = status === "error";

  return (
    <>
      <Confetti active={confetti} />

      <div className="glass rounded-xl p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isProcessing && "Đang xử lý..."}
              {isDone && "✅ Video sẵn sàng!"}
              {isError && "❌ Có lỗi xảy ra"}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              {jobId ? `Job ID: ${jobId.slice(0, 8)}…` : "Đang gửi yêu cầu..."}
            </p>
          </div>

          {isProcessing && (
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          )}
        </div>

        {/* Progress bar */}
        <ProgressBar progress={progress} step={currentStep} />

        {/* Log terminal */}
        <LogTerminal logs={logs} />

        {/* Actions */}
        <div className="flex items-center gap-3">
          {isDone && (
            <Button
              variant="gradient"
              size="lg"
              onClick={handleDownload}
              className="shadow-lg shadow-violet-500/20"
            >
              <Download className="w-5 h-5" />
              Tải về MP4
            </Button>
          )}

          {isError && (
            <Button variant="outline" size="md" onClick={onError}>
              <RotateCcw className="w-4 h-4" />
              Thử lại
            </Button>
          )}

          {isDone && (
            <p className="text-xs text-zinc-600">
              File sẽ bị xóa khỏi server sau khi tải về.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
