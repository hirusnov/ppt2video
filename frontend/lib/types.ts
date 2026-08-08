// ─── TTS types ────────────────────────────────────────────────────────────────

export interface KokoroVoice {
  id: string;
  label: string;
}

export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "diem_trinh", label: "Diễm Trinh" },
  { id: "hung_thinh", label: "Hưng Thịnh" },
  { id: "mai_linh", label: "Mai Linh" },
  { id: "mai_loan", label: "Mai Loan" },
  { id: "manh_dung", label: "Mạnh Dũng" },
  { id: "my_yen", label: "Mỹ Yến" },
  { id: "ngoc_huyen", label: "Ngọc Huyền" },
  { id: "phat_tai", label: "Phát Tài" },
  { id: "thanh_dat", label: "Thành Đạt" },
  { id: "thuc_trinh", label: "Thục Trinh" },
  { id: "tuan_ngoc", label: "Tuấn Ngọc" },
  { id: "storyvert", label: "Storyvert" },
  { id: "duc_an", label: "Đức An" },
  { id: "duc_duy", label: "Đức Duy" },
];

// ─── TTS Settings ─────────────────────────────────────────────────────────────

export interface TTSSettings {
  engine: "kokoro";
  kokoroVoice: string;
  speed: number; // 0.5 to 2.0, default 1.25
}

export const DEFAULT_SETTINGS: TTSSettings = {
  engine: "kokoro",
  kokoroVoice: "diem_trinh",
  speed: 1.25,
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
