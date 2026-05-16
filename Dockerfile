FROM node:24-bookworm-slim AS frontend

WORKDIR /app/taigi_web/frontend
COPY taigi_web/frontend/package*.json ./
RUN npm ci
COPY taigi_web/frontend/ ./
RUN npm run build

FROM python:3.11-slim AS web

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SETUPTOOLS_SCM_PRETEND_VERSION=0.1.0 \
    TAIGI_WEB_FFMPEG=/usr/bin/ffmpeg \
    TAIGI_WEB_FFPROBE=/usr/bin/ffprobe \
    TAIGI_WEB_VOXCPM_BIN=/usr/local/bin/voxcpm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        fonts-noto-cjk \
        libgomp1 \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
        "torch==2.11.0+cpu" \
        "torchaudio==2.11.0+cpu" \
    && pip install --no-cache-dir --no-deps "torchcodec==0.11.0" \
    && pip install --no-cache-dir .

COPY taigi_web/ ./taigi_web/
COPY --from=frontend /app/taigi_web/frontend/dist ./taigi_web/frontend/dist

RUN mkdir -p /app/taigi_web_jobs /app/pretrained_models/hf-cache /app/outputs

EXPOSE 8876

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8876/api/info', timeout=3).read()"

CMD ["uvicorn", "taigi_web.server:app", "--host", "0.0.0.0", "--port", "8876"]
