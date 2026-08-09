// ─── TTS types ────────────────────────────────────────────────────────────────

export type TTSEngineType = "kokoro" | "vieneu";

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

export interface VieNeuVoice {
  id: string;
  label: string;
}

export const VIENEU_VOICES: VieNeuVoice[] = [
  { id: "Minh Đức", label: "Minh Đức (Nam · Bắc · Tin tức)" },
  { id: "Phạm Tuyên", label: "Phạm Tuyên (Nam · Bắc · Tự nhiên)" },
  { id: "Thanh Bình", label: "Thanh Bình (Nam · Bắc · Kể chuyện)" },
  { id: "Trúc Ly", label: "Trúc Ly (Nữ · Bắc · Tự nhiên)" },
  { id: "Ngọc Linh", label: "Ngọc Linh (Nữ · Bắc · Kể chuyện)" },
  { id: "Đoan Trang", label: "Đoan Trang (Nữ · Bắc · Tự nhiên)" },
  { id: "Mai Anh", label: "Mai Anh (Nữ · Bắc · Tin tức)" },
  { id: "Quang Sơn", label: "Quang Sơn (Nam · Trung · Tự nhiên)" },
  { id: "Ngọc Trân", label: "Ngọc Trân (Nữ · Trung · Tự nhiên)" },
  { id: "Thái Sơn", label: "Thái Sơn (Nam · Nam · Kể chuyện)" },
  { id: "Xuân Vĩnh", label: "Xuân Vĩnh (Nam · Nam · Tự nhiên)" },
  { id: "Minh Triết", label: "Minh Triết (Nam · Nam · Tin tức)" },
  { id: "Thục Đoan", label: "Thục Đoan (Nữ · Nam · Kể chuyện)" },
  { id: "Thùy Dung", label: "Thùy Dung (Nữ · Nam · Tin tức)" },
];

export interface VieNeuStyle {
  id: string;
  label: string;
}

export const VIENEU_STYLES: VieNeuStyle[] = [
  { id: "tu_nhien", label: "Tự nhiên" },
  { id: "tin_tuc", label: "Tin tức" },
  { id: "doc_truyen", label: "Đọc truyện" },
];

// ─── TTS Settings ─────────────────────────────────────────────────────────────

export interface TTSSettings {
  engine: TTSEngineType;
  // Kokoro
  kokoroVoice: string;
  speed: number;
  // VieNeu
  vieneuVoice: string;
  vieneuStyle: string;
}

export const DEFAULT_SETTINGS: TTSSettings = {
  engine: "kokoro",
  kokoroVoice: "diem_trinh",
  speed: 1.0,
  vieneuVoice: "Minh Đức",
  vieneuStyle: "tu_nhien",
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
