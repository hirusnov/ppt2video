FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libreoffice \
    ffmpeg \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Kokoro model to bake into image (reduces cold-start)
RUN python -c "from kokoro_vietnamese import KokoroVietnamese; kv = KokoroVietnamese(device='cpu'); print('Kokoro model pre-loaded')" || echo "Kokoro pre-load skipped (will download on first run)"

# Copy application code
COPY . .

# Create temp directory
RUN mkdir -p /tmp/jobs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
