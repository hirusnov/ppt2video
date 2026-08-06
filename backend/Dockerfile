FROM python:3.11-slim

# Install system dependencies: LibreOffice full suite + ffmpeg + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    ffmpeg \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    wget \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

COPY requirements.txt .

# Install Python deps including kokoro-vietnamese[onnx]
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Kokoro model to bake into image (reduces cold-start)
RUN python -c "\
    from kokoro_vietnamese import KokoroVietnamese; \
    kv = KokoroVietnamese(device='cpu'); \
    kv.generate('xin chào', voice='diem_trinh'); \
    print('Kokoro model pre-loaded')" \
    || echo "Kokoro pre-load skipped (will download on first run)"

COPY . .

RUN mkdir -p /tmp/jobs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
