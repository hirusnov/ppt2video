"use client";
import React, { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Zap, Github, AlertTriangle } from "lucide-react";

import { Stepper } from "@/components/Stepper";
import { DropZone } from "@/components/DropZone";
import { ScriptEditor } from "@/components/ScriptEditor";
import { VoiceSettings } from "@/components/VoiceSettings";
import { SlideGrid } from "@/components/SlideGrid";
import { ProcessPanel } from "@/components/ProcessPanel";
import { Button } from "@/components/ui/button";

import {
  AppStep,
  TTSSettings,
  DEFAULT_SETTINGS,
  SlideSettingsMap,
  ValidateResponse,
  ScriptMap,
  SlideContent,
} from "@/lib/types";
import { backendUrl } from "@/lib/utils";

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-zinc-800/60 animate-pulse ${className ?? ""}`}
    />
  );
}

function ValidatingSkeleton() {
  return (
    <div className="glass rounded-xl p-6 space-y-4 animate-fade-in">
      <Skeleton className="h-5 w-40" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 p-4">
            <div className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Parse uploaded .txt into ScriptMap ──────────────────────────────────────
function parseTxtToScriptMap(content: string): ScriptMap {
  const pattern = /^S(\d+):\s*([\s\S]+?)(?=^S\d+:|\s*$)/gm;
  const map: ScriptMap = {};
  let match;
  while ((match = pattern.exec(content)) !== null) {
    map[Number(match[1])] = match[2].trim();
  }
  return map;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [step, setStep] = useState<AppStep>("upload");

  // Files
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [txtFile, setTxtFile] = useState<File | null>(null);

  // Script step
  const [extractedSlides, setExtractedSlides] = useState<SlideContent[]>([]);
  const [scriptMap, setScriptMap] = useState<ScriptMap>({});
  const [extracting, setExtracting] = useState(false);

  // Configure step
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(
    null,
  );
  const [globalSettings, setGlobalSettings] =
    useState<TTSSettings>(DEFAULT_SETTINGS);
  const [slideSettingsMap, setSlideSettingsMap] = useState<SlideSettingsMap>(
    {},
  );
  const [validating, setValidating] = useState(false);

  // Done
  const [jobId, setJobId] = useState<string | null>(null);

  // Health
  const [health, setHealth] = useState<{
    status: "checking" | "ok" | "error";
    engines: string[];
  }>({ status: "checking", engines: [] });

  useEffect(() => {
    fetch(backendUrl("/health"))
      .then((r) => r.json())
      .then((d) =>
        setHealth({
          status: d.status === "ok" ? "ok" : "error",
          engines: d.engines ?? [],
        }),
      )
      .catch(() => setHealth({ status: "error", engines: [] }));
  }, []);

  // ── Step 1 → Step 2: go to script editor ─────────────────────────────────
  const handleGoToScript = useCallback(async () => {
    if (!pptxFile) return;

    // If a .txt was uploaded, parse it and pre-seed the map
    let preSeeded: ScriptMap = {};
    if (txtFile) {
      try {
        const content = await txtFile.text();
        preSeeded = parseTxtToScriptMap(content);
      } catch {
        /* ignore */
      }
    }

    setExtracting(true);
    try {
      const form = new FormData();
      form.append("pptx", pptxFile);
      const res = await fetch(backendUrl("/api/extract-slides"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Không thể đọc PPTX");
      const data = await res.json();
      setExtractedSlides(data.slides);

      // If pre-seeded from .txt use that; otherwise seed from slide text
      if (Object.keys(preSeeded).length > 0) {
        setScriptMap(preSeeded);
      } else {
        const seeded: ScriptMap = {};
        for (const s of data.slides) {
          seeded[s.index] = s.allText || "";
        }
        setScriptMap(seeded);
      }

      setStep("script");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi đọc slides");
    } finally {
      setExtracting(false);
    }
  }, [pptxFile, txtFile]);

  // ── Step 2 → Step 3: validate after script confirmed ─────────────────────
  const handleScriptConfirmed = useCallback(
    async (confirmedMap: ScriptMap, slides: SlideContent[]) => {
      setScriptMap(confirmedMap);
      setExtractedSlides(slides);

      // Build a synthetic .txt blob and call /api/validate
      const scriptContent = Object.entries(confirmedMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([idx, text]) => `S${idx}: ${text}`)
        .join("\n\n");
      const scriptBlob = new File([scriptContent], "script.txt", {
        type: "text/plain",
      });

      setValidating(true);
      try {
        if (!pptxFile) throw new Error("File PPTX chưa được chọn");
        const form = new FormData();
        form.append("pptx", pptxFile);
        form.append("script", scriptBlob);
        const res = await fetch(backendUrl("/api/validate"), {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Lỗi server" }));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const data: ValidateResponse = await res.json();
        // Merge the script text we already have
        const mergedSlides = data.slides.map((s) => ({
          ...s,
          text: confirmedMap[s.index] ?? s.text,
        }));
        setValidateResult({ ...data, slides: mergedSlides });
        setSlideSettingsMap({});
        setStep("configure");
        if (data.warnings.length > 0) {
          data.warnings.forEach((w) => toast.warning(w, { duration: 6000 }));
        } else {
          toast.success(`${data.totalSlides} slide sẵn sàng`);
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Validate thất bại");
      } finally {
        setValidating(false);
      }
    },
    [pptxFile],
  );

  // ── Step 3 → Step 4 ───────────────────────────────────────────────────────
  const handleProcess = useCallback(() => {
    if (pptxFile && validateResult) setStep("process");
  }, [pptxFile, validateResult]);

  // ── Download done ──────────────────────────────────────────────────────────
  const handleDownloadDone = useCallback((id: string) => {
    setJobId(id);
    setStep("download");
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep("upload");
    setValidateResult(null);
    setPptxFile(null);
    setTxtFile(null);
    setJobId(null);
    setSlideSettingsMap({});
    setGlobalSettings(DEFAULT_SETTINGS);
    setExtractedSlides([]);
    setScriptMap({});
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-bold text-white tracking-tight">
                PPT2VIDEO
              </span>
              <span className="ml-2 text-xs text-zinc-500">
                PPTX → MP4 · AI TTS tiếng Việt
              </span>
            </div>
            <span className="sm:hidden text-sm font-bold text-white">
              PPT2VIDEO
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-white/8 text-xs">
            <span
              className={
                health.status === "checking"
                  ? "w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse"
                  : health.status === "ok"
                    ? "w-1.5 h-1.5 rounded-full bg-emerald-500"
                    : "w-1.5 h-1.5 rounded-full bg-red-500"
              }
            />
            <span className="text-zinc-400 hidden sm:inline">
              {health.status === "checking"
                ? "Connecting…"
                : health.status === "ok"
                  ? `Backend · ${health.engines.join(", ")}`
                  : "Backend offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {health.status === "error" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-900/10 p-4 text-sm animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-medium">
                Backend chưa sẵn sàng
              </p>
              <p className="text-amber-400/70 text-xs mt-0.5">
                Đảm bảo backend đang chạy tại{" "}
                <code className="font-mono">{backendUrl("")}</code>
              </p>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="glass rounded-xl p-4">
          <Stepper currentStep={step} />
        </div>

        {/* ── Step: Upload ── */}
        {step === "upload" && (
          <div className="glass rounded-xl p-6 space-y-6 animate-fade-in">
            <div>
              <h2 className="text-base font-semibold text-white">
                Tải file lên
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Upload file PowerPoint (bắt buộc). Script có thể upload sẵn hoặc
                tạo ở bước sau.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DropZone
                label="File PowerPoint *"
                accept=".pptx"
                acceptLabel=".pptx"
                file={pptxFile}
                onFile={setPptxFile}
                icon="pptx"
              />
              <DropZone
                label="Script tiếng Việt (tuỳ chọn)"
                accept=".txt"
                acceptLabel=".txt — S1: ... S2: ... hoặc để trống"
                file={txtFile}
                onFile={setTxtFile}
                icon="txt"
              />
            </div>

            {/* Format guide — collapsible */}
            {txtFile && (
              <div className="rounded-lg bg-zinc-900/80 border border-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">
                  Định dạng script:
                </p>
                <pre className="text-xs text-zinc-500 font-mono leading-relaxed whitespace-pre-wrap">{`S1: Xin chào, đây là slide đầu tiên.

S2: Nội dung slide thứ hai.

S3: Kết luận và cảm ơn.`}</pre>
              </div>
            )}

            {!txtFile && (
              <div className="rounded-lg bg-zinc-900/60 border border-violet-500/10 p-4 flex items-start gap-3">
                <Zap className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-violet-300">
                    Không có script?
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Ở bước tiếp theo bạn có thể tự nhập, chỉnh sửa hoặc dùng AI
                    tự động tạo script từ nội dung từng slide.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="gradient"
                size="lg"
                disabled={!pptxFile}
                loading={extracting}
                onClick={handleGoToScript}
              >
                {txtFile
                  ? "Tiếp tục → Chỉnh sửa script"
                  : "Tiếp tục → Tạo script"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Extracting skeleton ── */}
        {extracting && <ValidatingSkeleton />}

        {/* ── Step: Script editor ── */}
        {step === "script" && pptxFile && !extracting && (
          <>
            {validating && <ValidatingSkeleton />}
            {!validating && (
              <ScriptEditor
                pptxFile={pptxFile}
                initialSlides={extractedSlides}
                initialScripts={scriptMap}
                onContinue={handleScriptConfirmed}
                onBack={() => setStep("upload")}
              />
            )}
          </>
        )}

        {/* ── Step: Configure ── */}
        {step === "configure" && validateResult && !validating && (
          <div className="space-y-5 animate-fade-in">
            <div className="glass rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Cài đặt giọng đọc
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    {validateResult.totalSlides} slide · Áp dụng cho tất cả,
                    override từng slide bên dưới
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("script")}
                >
                  ← Script
                </Button>
              </div>
              <VoiceSettings
                settings={globalSettings}
                onChange={setGlobalSettings}
              />
            </div>

            <SlideGrid
              slides={validateResult.slides}
              globalSettings={globalSettings}
              slideSettingsMap={slideSettingsMap}
              onSlideSettingsChange={setSlideSettingsMap}
            />

            <div className="flex justify-end pt-2">
              <Button variant="gradient" size="lg" onClick={handleProcess}>
                <Zap className="w-4 h-4" />
                Bắt đầu xử lý →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Process ── */}
        {step === "process" && pptxFile && validateResult && (
          <ProcessPanel
            pptxFile={pptxFile}
            scriptMap={scriptMap}
            globalSettings={globalSettings}
            slideSettingsMap={slideSettingsMap}
            totalSlides={validateResult.totalSlides}
            onDone={handleDownloadDone}
            onError={() => setStep("configure")}
          />
        )}

        {/* ── Step: Download ── */}
        {step === "download" && jobId && (
          <div className="glass rounded-xl p-10 text-center space-y-5 animate-fade-in">
            <div className="text-5xl">🎉</div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                Video đã tải về!
              </h2>
              <p className="text-sm text-zinc-500 mt-2">
                Job{" "}
                <code className="font-mono text-zinc-300">
                  {jobId.slice(0, 8)}…
                </code>{" "}
                đã hoàn thành và dữ liệu tạm đã được xóa khỏi server.
              </p>
            </div>
            <Button variant="gradient" size="lg" onClick={handleReset}>
              Tạo video mới
            </Button>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <span>
            PPT2VIDEO · Edge TTS + Kokoro-Vietnamese · FastAPI + Next.js 14
          </span>
          <a
            href="https://github.com"
            className="flex items-center gap-1.5 hover:text-zinc-400 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
