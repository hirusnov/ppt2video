"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, ChevronDown, ChevronUp, Eye, EyeOff,
  RefreshCw, Check, AlertCircle, Key, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { backendUrl } from "@/lib/utils";
import {
  SlideContent, ScriptMap, AISettings, AIProvider, AIStyle,
  DEFAULT_AI_SETTINGS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ─── AI Settings Panel ────────────────────────────────────────────────────────

interface AIPanelProps {
  settings: AISettings;
  onChange: (s: AISettings) => void;
  onGenerateAll: () => void;
  generating: boolean;
  totalSlides: number;
}

function AIPanel({ settings, onChange, onGenerateAll, generating, totalSlides }: AIPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [open, setOpen] = useState(false);

  const update = <K extends keyof AISettings>(k: K, v: AISettings[K]) =>
    onChange({ ...settings, [k]: v });

  const modelPlaceholder = settings.provider === "gemini"
    ? "gemini-1.5-flash"
    : "gpt-4o-mini";

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-violet-300">AI Tự động tạo script</span>
          {settings.apiKey && (
            <Badge variant="custom" className="text-[10px]">API Key ✓</Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-violet-500/10 pt-4 animate-slide-up">
          {/* Provider + Style row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Provider</label>
              <Select
                value={settings.provider}
                onValueChange={v => update("provider", v as AIProvider)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI GPT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Phong cách</label>
              <Select
                value={settings.style}
                onValueChange={v => update("style", v as AIStyle)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Tự nhiên</SelectItem>
                  <SelectItem value="formal">Trang trọng</SelectItem>
                  <SelectItem value="friendly">Thân thiện</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Model (optional) */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Model <span className="text-zinc-600">(tuỳ chọn — để trống dùng mặc định)</span>
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={e => update("model", e.target.value)}
              placeholder={modelPlaceholder}
              className="w-full h-8 rounded-md border border-white/10 bg-zinc-900 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 flex items-center gap-1">
              <Key className="w-3 h-3" />
              API Key
              <span className="text-zinc-600 ml-1">
                (chỉ dùng phía client, không lưu trên server)
              </span>
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={e => update("apiKey", e.target.value)}
                placeholder={
                  settings.provider === "gemini"
                    ? "AIza..."
                    : "sk-..."
                }
                className="w-full h-8 rounded-md border border-white/10 bg-zinc-900 px-3 pr-9 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Generate all button */}
          <Button
            variant="gradient"
            size="sm"
            onClick={onGenerateAll}
            loading={generating}
            disabled={!settings.apiKey.trim()}
            className="w-full"
          >
            <Wand2 className="w-4 h-4" />
            {generating
              ? "Đang tạo script..."
              : `Tạo script cho tất cả ${totalSlides} slide`}
          </Button>

          {!settings.apiKey.trim() && (
            <p className="text-xs text-zinc-600 text-center">
              Nhập API key để kích hoạt tính năng AI
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single slide script row ──────────────────────────────────────────────────

interface SlideScriptRowProps {
  slide: SlideContent;
  script: string;
  onChange: (text: string) => void;
  onGenerateOne: () => void;
  generating: boolean;
  hasApiKey: boolean;
}

function SlideScriptRow({
  slide, script, onChange, onGenerateOne, generating, hasApiKey,
}: SlideScriptRowProps) {
  const [showThumb, setShowThumb] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(72, el.scrollHeight)}px`;
  }, [script]);

  const isEmpty = !script.trim();
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200 overflow-hidden",
      isEmpty ? "border-white/8 bg-zinc-900/40" : "border-emerald-500/20 bg-emerald-500/3"
    )}>
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Slide number */}
        <div className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
          isEmpty ? "bg-zinc-800 text-zinc-500" : "bg-emerald-500/15 text-emerald-400"
        )}>
          {slide.index}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">
            {slide.title || `Slide ${slide.index}`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {slide.hasPicture && (
              <span className="text-xs text-zinc-600">📷 Có hình ảnh</span>
            )}
            {!isEmpty && (
              <span className="text-xs text-zinc-600">{wordCount} từ</span>
            )}
            {isEmpty && (
              <span className="text-xs text-amber-500/80">Chưa có script</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Thumbnail toggle */}
          <button
            type="button"
            onClick={() => setShowThumb(v => !v)}
            title={showThumb ? "Ẩn preview" : "Xem slide"}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            {showThumb ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Generate single */}
          {hasApiKey && (
            <button
              type="button"
              onClick={onGenerateOne}
              disabled={generating}
              title="AI tạo script cho slide này"
              className={cn(
                "p-1.5 rounded-md transition-colors",
                generating
                  ? "text-violet-400 animate-spin cursor-not-allowed"
                  : "text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10"
              )}
            >
              {generating ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Thumbnail */}
      {showThumb && (
        <div className="px-4 pb-3">
          <img
            src={`data:image/png;base64,${slide.thumbnail}`}
            alt={`Slide ${slide.index}`}
            className="w-full rounded-lg border border-white/10 object-cover max-h-48"
          />
        </div>
      )}

      {/* Textarea */}
      <div className="px-4 pb-3">
        <textarea
          ref={textareaRef}
          value={script}
          onChange={e => onChange(e.target.value)}
          placeholder={`Nhập script cho slide ${slide.index}...`}
          className={cn(
            "w-full resize-none rounded-lg border bg-zinc-950/50 px-3 py-2 text-sm text-zinc-200",
            "placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50",
            "transition-colors duration-150",
            isEmpty ? "border-white/8" : "border-emerald-500/20"
          )}
          rows={3}
        />
      </div>
    </div>
  );
}

// ─── Main ScriptEditor component ──────────────────────────────────────────────

interface ScriptEditorProps {
  pptxFile: File;
  /** Pre-loaded slides from /api/extract-slides (if already fetched) */
  initialSlides?: SlideContent[];
  /** Pre-populated script map (e.g. from uploaded .txt file) */
  initialScripts?: ScriptMap;
  onContinue: (scriptMap: ScriptMap, slides: SlideContent[]) => void;
  onBack: () => void;
}

export function ScriptEditor({
  pptxFile,
  initialSlides,
  initialScripts,
  onContinue,
  onBack,
}: ScriptEditorProps) {
  const [slides, setSlides] = useState<SlideContent[]>(initialSlides ?? []);
  const [scripts, setScripts] = useState<ScriptMap>(initialScripts ?? {});
  const [loading, setLoading] = useState(!initialSlides);
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSlide, setGeneratingSlide] = useState<number | null>(null);

  // Load slides from backend if not pre-loaded
  useEffect(() => {
    if (initialSlides && initialSlides.length > 0) {
      setSlides(initialSlides);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const form = new FormData();
        form.append("pptx", pptxFile);
        const res = await fetch(backendUrl("/api/extract-slides"), {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("Không thể đọc PPTX");
        const data = await res.json();
        setSlides(data.slides);
        // If no pre-populated scripts, seed from slide text
        if (!initialScripts || Object.keys(initialScripts).length === 0) {
          const seed: ScriptMap = {};
          for (const s of data.slides) {
            seed[s.index] = s.allText || "";
          }
          setScripts(seed);
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Lỗi đọc slides");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pptxFile]);

  // Seed scripts from initialScripts if provided
  useEffect(() => {
    if (initialScripts && Object.keys(initialScripts).length > 0) {
      setScripts(initialScripts);
    }
  }, [initialScripts]);

  const updateScript = useCallback((idx: number, text: string) => {
    setScripts(prev => ({ ...prev, [idx]: text }));
  }, []);

  // ── Generate all slides via SSE ──────────────────────────────────────────
  const handleGenerateAll = useCallback(async () => {
    if (!aiSettings.apiKey.trim() || slides.length === 0) return;
    setGeneratingAll(true);

    const form = new FormData();
    form.append("slides_json", JSON.stringify(
      slides.map(s => ({ index: s.index, title: s.title, allText: s.allText }))
    ));
    form.append("provider", aiSettings.provider);
    form.append("api_key", aiSettings.apiKey);
    form.append("model", aiSettings.model);
    form.append("style", aiSettings.style);

    try {
      const res = await fetch(backendUrl("/api/generate-script"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Lỗi AI" }));
        throw new Error(err.detail || "AI generation failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.done) {
              toast.success("Đã tạo xong script cho tất cả slide!");
            } else if (ev.index > 0) {
              setScripts(prev => ({ ...prev, [ev.index]: ev.script }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI generation thất bại");
    } finally {
      setGeneratingAll(false);
    }
  }, [aiSettings, slides]);

  // ── Generate single slide ─────────────────────────────────────────────────
  const handleGenerateOne = useCallback(async (slide: SlideContent) => {
    if (!aiSettings.apiKey.trim()) return;
    setGeneratingSlide(slide.index);

    const form = new FormData();
    form.append("slides_json", JSON.stringify([
      { index: slide.index, title: slide.title, allText: slide.allText }
    ]));
    form.append("provider", aiSettings.provider);
    form.append("api_key", aiSettings.apiKey);
    form.append("model", aiSettings.model);
    form.append("style", aiSettings.style);

    try {
      const res = await fetch(backendUrl("/api/generate-script"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("AI generation failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (!ev.done && ev.index > 0) {
              setScripts(prev => ({ ...prev, [ev.index]: ev.script }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "AI thất bại cho slide này");
    } finally {
      setGeneratingSlide(null);
    }
  }, [aiSettings]);

  const filledCount = slides.filter(s => scripts[s.index]?.trim()).length;
  const allFilled = filledCount === slides.length && slides.length > 0;

  const handleContinue = useCallback(() => {
    // Warn if any slide missing script
    const missing = slides.filter(s => !scripts[s.index]?.trim());
    if (missing.length > 0) {
      toast.warning(
        `${missing.length} slide chưa có script. Slide trống sẽ không có audio.`,
        { duration: 5000 }
      );
    }
    onContinue(scripts, slides);
  }, [scripts, slides, onContinue]);

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="glass rounded-xl p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" />
          <span className="text-sm text-zinc-400">Đang đọc nội dung slides...</span>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 p-4 space-y-2">
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-zinc-800/60 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-zinc-800/60 animate-pulse" />
                <div className="h-16 w-full rounded-lg bg-zinc-800/60 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header card */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Script từng slide
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              {slides.length} slide ·{" "}
              <span className={allFilled ? "text-emerald-400" : "text-amber-400"}>
                {filledCount}/{slides.length} đã có script
              </span>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Quay lại
          </Button>
        </div>

        {/* AI panel */}
        <AIPanel
          settings={aiSettings}
          onChange={setAiSettings}
          onGenerateAll={handleGenerateAll}
          generating={generatingAll}
          totalSlides={slides.length}
        />
      </div>

      {/* Slide rows */}
      <div className="space-y-2">
        {slides.map(slide => (
          <SlideScriptRow
            key={slide.index}
            slide={slide}
            script={scripts[slide.index] ?? ""}
            onChange={text => updateScript(slide.index, text)}
            onGenerateOne={() => handleGenerateOne(slide)}
            generating={generatingSlide === slide.index || generatingAll}
            hasApiKey={!!aiSettings.apiKey.trim()}
          />
        ))}
      </div>

      {/* Continue */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-zinc-600">
          {allFilled ? (
            <span className="flex items-center gap-1 text-emerald-500">
              <Check className="w-3.5 h-3.5" /> Tất cả slide đã có script
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-500/80">
              <AlertCircle className="w-3.5 h-3.5" />
              {slides.length - filledCount} slide chưa có script
            </span>
          )}
        </p>
        <Button variant="gradient" size="lg" onClick={handleContinue}>
          Tiếp tục → Cài đặt giọng đọc
        </Button>
      </div>
    </div>
  );
}
