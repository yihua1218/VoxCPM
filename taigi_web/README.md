# Taigi Voice Video Web

Private local web tool for this VoxCPM checkout.

It follows the same broad pattern as the local web tools in this workspace:

- FastAPI backend
- Vite/React frontend
- local disk-backed job store
- background worker for long-running jobs
- browser polling for progress

## Run

From the VoxCPM repo root:

```bash
.venv/bin/uvicorn taigi_web.server:app --host 127.0.0.1 --port 8876
```

Then open:

```text
http://127.0.0.1:8876
```

If `TAIGI_WEB_TOKEN` is not set, the server allows loopback access only.
Set `TAIGI_WEB_TOKEN` to require browser sign-in.

## Run With Docker Compose

From the VoxCPM repo root:

```bash
docker compose up --build
```

Then open:

```text
http://127.0.0.1:8877
```

The Compose service mounts these local directories into the container:

- `taigi_web_jobs` for generated job files
- `pretrained_models` for the Hugging Face cache
- `outputs` as read-only input assets, including the default reference audio

Docker Desktop on macOS does not expose Apple MPS/Metal GPU acceleration to this Linux container, so Compose defaults `TAIGI_WEB_DEFAULT_DEVICE=cpu`. For MPS acceleration, run the web app natively on macOS with `TAIGI_WEB_DEFAULT_DEVICE=mps`.

Set `TAIGI_WEB_PORT=8876` if you want Compose to publish the same external port as the native local server.

## Build Frontend

```bash
cd taigi_web/frontend
npm install
npm run build
```

## Pipeline

Each job runs:

1. translate Chinese draft into a Taigi draft
2. produce Tailo helper text with Taibun
3. split the Taigi script into segments
4. run `voxcpm clone` for each segment
5. join WAV files
6. render subtitle PNGs and waveform MP4 with ffmpeg
7. package outputs as a zip
8. optionally copy selected files to OneDrive

Completed jobs also expose a segment review workspace. Each segment keeps:

- source Chinese text
- generated Taigi text
- Tailo helper text
- segment WAV file
- rating and feedback history

Feedback is saved to:

```text
taigi_web_jobs/translation_memory.json
```

Term-level corrections in that file are applied before the built-in phrase map on future translation jobs.

## Environment

Useful variables:

```bash
TAIGI_WEB_TOKEN=...
TAIGI_WEB_JOB_DIR=...
TAIGI_WEB_REFERENCE_AUDIO=/path/to/ref.wav
TAIGI_WEB_MODEL_CACHE=/path/to/hf-cache
TAIGI_WEB_WORKERS=1
TAIGI_WEB_FFMPEG=/opt/homebrew/bin/ffmpeg
TAIGI_WEB_FFPROBE=/opt/homebrew/bin/ffprobe
TAIGI_WEB_VOXCPM_BIN=/path/to/voxcpm
TAIGI_WEB_DEFAULT_DEVICE=mps
TAIGI_WEB_COPY_TO_ONEDRIVE=1
```

The default reference audio is:

```text
outputs/taigi_full_segments/seg_02.wav
```
