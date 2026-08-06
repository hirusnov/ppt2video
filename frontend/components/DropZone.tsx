"use client";
import React, { useCallback, useState } from "react";
import {
  UploadCloud,
  FileText,
  Presentation,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  label: string;
  accept: string;
  acceptLabel: string;
  file: File | null;
  onFile: (file: File | null) => void;
  icon?: "pptx" | "txt";
  disabled?: boolean;
}

export function DropZone({
  label,
  accept,
  acceptLabel,
  file,
  onFile,
  icon = "txt",
  disabled,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (f: File): boolean => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      const allowed = accept
        .split(",")
        .map((a) => a.trim().replace(".", "").toLowerCase());
      if (!ext || !allowed.includes(ext)) {
        setError(`Chỉ chấp nhận file ${acceptLabel}`);
        return false;
      }
      setError(null);
      return true;
    },
    [accept, acceptLabel],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files[0];
      if (dropped && validate(dropped)) onFile(dropped);
    },
    [disabled, validate, onFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected && validate(selected)) onFile(selected);
      e.target.value = "";
    },
    [validate, onFile],
  );

  const FileIcon = icon === "pptx" ? Presentation : FileText;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group",
          dragging
            ? "border-violet-500 bg-violet-500/10"
            : "border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          file && "border-emerald-500/40 bg-emerald-500/5",
        )}
      >
        <label
          className={cn(
            "flex flex-col items-center justify-center gap-3 p-6 cursor-pointer",
            disabled && "pointer-events-none",
          )}
        >
          <input
            type="file"
            accept={accept}
            onChange={handleChange}
            className="sr-only"
            disabled={disabled}
          />
          {file ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <FileIcon className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-200 truncate max-w-[180px]">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-xl border transition-colors",
                  dragging
                    ? "bg-violet-500/20 border-violet-500/40"
                    : "bg-zinc-800 border-white/10 group-hover:bg-zinc-700",
                )}
              >
                <UploadCloud
                  className={cn(
                    "w-6 h-6 transition-colors",
                    dragging
                      ? "text-violet-400"
                      : "text-zinc-500 group-hover:text-zinc-300",
                  )}
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-200 font-medium">Kéo thả</span>{" "}
                  hoặc{" "}
                  <span className="text-violet-400 font-medium">
                    click để chọn
                  </span>
                </p>
                <p className="text-xs text-zinc-600 mt-1">{acceptLabel}</p>
              </div>
            </>
          )}
        </label>

        {/* Clear button */}
        {file && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              setError(null);
            }}
            className="absolute top-2 right-2 p-1 rounded-md bg-zinc-800 border border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
