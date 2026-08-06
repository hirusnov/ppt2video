# PPT2VIDEO

Convert PowerPoint presentations to MP4 videos with AI-powered Vietnamese text-to-speech.

**Stack:** Next.js 14 (Vercel) · FastAPI (Render.com) · Edge TTS · Kokoro-Vietnamese · LibreOffice · FFmpeg

---

## Features

- Drag-and-drop upload for `.pptx` and `.txt` script
- Script format: `S1: text for slide 1`, `S2: text for slide 2`, …
- Two TTS engines:
  - **Edge TTS** — `vi-VN-HoaiMyNeural` / `vi-VN-NamMinhNeural`, rate/pitch/volume control
  - **Kokoro-Vietnamese** — 14 natural Vietnamese voices, ONNX CPU inference
- Per-slide voice override with global defaults
- Realtime log streaming via SSE
- H.264 MP4 output with fade transitions and 1.5s pause between slides
- Auto-cleanup after download

---

## Project structure

```
PPT2VIDEO/
├── frontend/          # Next.js 14 app
│   ├── app/
│   ├── components/
│   └── lib/
├── backend/           # FastAPI service
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── tts/
│   ├── Dockerfile
│   └── requirements.txt
├── render.yaml        # Render.com deploy config
└── vercel.json        # Vercel deploy config
```

---

## Local development

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Requires: `libreoffice` and `ffmpeg` on PATH (or Docker).

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` in `frontend/.env.local`.

---

## Deploy

### Backend → Render.com

1. Push repo to GitHub
2. New Web Service on Render → connect repo
3. Select `render.yaml` (Infrastructure as Code) — it will auto-detect Docker
4. Set env var: `FRONTEND_URL` = your Vercel URL

### Frontend → Vercel

1. Import repo on Vercel
2. Set env var: `NEXT_PUBLIC_BACKEND_URL` = your Render service URL
3. Deploy — `vercel.json` handles build command and rewrites

---

## Script format

```
S1: Xin chào, đây là nội dung slide đầu tiên của bài thuyết trình.

S2: Slide thứ hai với thông tin chi tiết về chủ đề chính.

S3: Kết luận và câu hỏi thảo luận từ khán giả.
```

Each `S<n>:` marker maps to the corresponding slide in the PPTX file. A warning is shown if the counts don't match — the pipeline uses `min(script_count, pptx_count)` slides.
