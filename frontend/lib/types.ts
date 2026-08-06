// ─── TTS types ────────────────────────────────────────────────────────────────

export interface KokoroVoice {
  id: string;
  label: string;
}

export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "diem_trinh", label: "Diễm Trinh" },
  { id: "mai_linh", label: "Mai Linh" },
  { id: "tuan_ngoc", label: "Tuấn Ngọc" },
  { id: "thu_ha", label: "Thu Hà" },
  { id: "bao_chau", label: "Bảo Châu" },
  { id: "minh_quan", label: "Minh Quân" },
  { id: "hong_nhung", label: "Hồng Nhung" },
  { id: "duc_tuan", label: "Đức Tuấn" },
  { id: "my_tam", label: "Mỹ Tâm" },
  { id: "quang_dung", label: "Quang Dũng" },
  { id: "thanh_lam", label: "Thanh Lam" },
  { id: "le_quyen", label: "Lệ Quyên" },
  { id: "trong_tan", label: "Trọng Tấn" },
  { id: "anh_tho", label: "Anh Thơ" },
];

// ─── TTS Settings ─────────────────────────────────────────────────────────────

export interface TTSSettings {
  engine: "kokoro";
  kokoroVoice: string;
}

export const DEFAULT_SETTINGS: TTSSettings = {
  engine: "kokoro",
  kokoroVoice: "diem_trinh",
};

// ─── Slide types ──────────────────────────────────────────────────────────────

export interface SlideData {
  index: number;
  text: string;
  charCount: number;
}

export interface ValidateResponse {
  slides: SlideData[];
  totalSlides: number;
  warnings: string[];
}

export interface SlideSettings {
  override: boolean;
  settings: Partial<TTSSettings>;
}

export type SlideSettingsMap = Record<number, SlideSettings>;

// ─── Job / Process types ──────────────────────────────────────────────────────

export type JobStatus = "idle" | "queued" | "processing" | "done" | "error";

export interface SSEEvent {
  step: string;
  slide?: number;
  total?: number;
  message: string;
  progress: number;
  error?: string;
}

export interface LogLine {
  id: string;
  step: string;
  message: string;
  progress: number;
  timestamp: Date;
}

// ─── App step ─────────────────────────────────────────────────────────────────

export type AppStep =
  | "upload"
  | "script"
  | "configure"
  | "process"
  | "download";

// ─── Slide content (from /api/extract-slides) ────────────────────────────────

export interface SlideContent {
  index: number;
  title: string;
  body: string[];
  allText: string;
  thumbnail: string; // base64 PNG
  hasPicture: boolean;
}

export interface ExtractResponse {
  slides: SlideContent[];
  totalSlides: number;
}

// ─── AI script generation ─────────────────────────────────────────────────────

export type AIProvider = "gemini" | "openai";
export type AIStyle = "natural" | "formal" | "friendly";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  style: AIStyle;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "gemini",
  apiKey: "",
  model: "",
  style: "natural",
};

// Per-slide script text map: index → narration string
export type ScriptMap = Record<number, string>;
