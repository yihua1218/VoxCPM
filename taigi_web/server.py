import json
import os
import random
import re
import secrets
import smtplib
import shutil
import subprocess
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from email.message import EmailMessage
from hashlib import sha256
from ipaddress import ip_address
from pathlib import Path
from queue import PriorityQueue
from threading import Lock, Thread
from typing import Annotated, Literal, Optional
from urllib.parse import quote, urlencode

from fastapi import Cookie, FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

try:
    from taibun import Converter
except Exception:  # pragma: no cover
    Converter = None


ROOT = Path(__file__).resolve().parents[1]
JOB_ROOT = Path(os.environ.get("TAIGI_WEB_JOB_DIR", ROOT / "taigi_web_jobs"))
FRONTEND_DIST = Path(os.environ.get("TAIGI_WEB_FRONTEND_DIST", ROOT / "taigi_web" / "frontend" / "dist"))
CACHE_DIR = Path(os.environ.get("TAIGI_WEB_MODEL_CACHE", ROOT / "pretrained_models" / "hf-cache"))
DEFAULT_REFERENCE_AUDIO = Path(os.environ.get("TAIGI_WEB_REFERENCE_AUDIO", ROOT / "outputs" / "taigi_full_segments" / "seg_02.wav"))
FFMPEG = os.environ.get("TAIGI_WEB_FFMPEG") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = os.environ.get("TAIGI_WEB_FFPROBE") or shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
VOXCPM_BIN = os.environ.get("TAIGI_WEB_VOXCPM_BIN") or shutil.which("voxcpm") or str(ROOT / ".venv" / "bin" / "voxcpm")
DEFAULT_DEVICE = os.environ.get("TAIGI_WEB_DEFAULT_DEVICE", "mps")
DEFAULT_COPY_TO_ONEDRIVE = os.environ.get("TAIGI_WEB_COPY_TO_ONEDRIVE", "1").lower() not in {"0", "false", "no", "off"}
TRANSLATION_MEMORY = Path(os.environ.get("TAIGI_WEB_TRANSLATION_MEMORY", JOB_ROOT / "translation_memory.json"))
PUBLIC_ACCESS = os.environ.get("TAIGI_WEB_PUBLIC_ACCESS", "1").lower() not in {"0", "false", "no", "off"}
SESSION_COOKIE = "taigi_web_token"
ADMIN_SESSION_COOKIE = "taigi_admin_session"
ADMIN_EMAIL = (os.environ.get("TAIGI_WEB_ADMIN_EMAIL") or os.environ.get("ADMIN_EMAIL") or "yihua1218@gmail.com").strip().lower()
PUBLIC_URL = os.environ.get("TAIGI_WEB_PUBLIC_URL") or os.environ.get("PUBLIC_URL") or "https://taigi.yihua.app"
AUTH_STORE = JOB_ROOT / "auth_store.json"
MAGIC_LINK_TTL_SECONDS = int(os.environ.get("TAIGI_WEB_MAGIC_LINK_TTL_SECONDS", "900"))
SESSION_TTL_SECONDS = int(os.environ.get("TAIGI_WEB_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 30)))
memory_lock = Lock()
auth_lock = Lock()
rate_limit_lock = Lock()
rate_limit_seen: dict[str, float] = {}
job_queue: PriorityQueue = PriorityQueue()
job_counter_lock = Lock()
job_counter = 0
RATE_LIMIT_SECONDS = int(os.environ.get("TAIGI_WEB_PUBLIC_JOB_INTERVAL_SECONDS", "600"))
SETTINGS_PATH = JOB_ROOT / "admin_settings.json"


class CreateJobRequest(BaseModel):
    title: str = "台語語音影片"
    chinese_text: str
    taigi_override: str = ""
    reference_voice_mode: Optional[Literal["default", "random"]] = None
    control: str = "闽南话，台湾口音，语气自然，语速正常，保持参考音频的男声音色和说话方式"
    device: str = DEFAULT_DEVICE
    inference_timesteps: int = 10
    cfg_value: float = 2.5
    max_chars_per_segment: int = 90
    make_video: bool = True
    copy_to_onedrive: bool = DEFAULT_COPY_TO_ONEDRIVE


class MagicLinkRequest(BaseModel):
    email: str


class VerifyMagicLinkRequest(BaseModel):
    token: str


class AppSettings(BaseModel):
    default_reference_voice_mode: Literal["default", "random"] = "default"
    public_rate_limit_seconds: int = RATE_LIMIT_SECONDS
    api_access_token: str = ""


class Job(BaseModel):
    id: str
    title: str
    status: Literal["queued", "running", "complete", "failed"]
    stage: str
    progress: int
    created_at: float
    updated_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    elapsed_seconds: Optional[float] = None
    chinese_text: str
    taigi_text: str = ""
    tailo_text: str = ""
    segment_count: int = 0
    output_dir: Optional[str] = None
    audio_path: Optional[str] = None
    video_path: Optional[str] = None
    zip_path: Optional[str] = None
    onedrive_dir: Optional[str] = None
    error: Optional[str] = None


class SegmentCorrection(BaseModel):
    source_phrase: str = ""
    taigi_correction: str = ""
    tailo_correction: str = ""
    note: str = ""


class SegmentFeedback(BaseModel):
    rating: int
    note: str = ""
    corrected_taigi_text: str = ""
    corrected_tailo_text: str = ""
    corrections: list[SegmentCorrection] = []


RANDOM_VOICE_CONTROLS = [
    "闽南话，台湾口音，成年男性，声音温和自然，语速正常，像广播旁白",
    "闽南话，台湾口音，成年男性，声音低沉稳定，语气亲切，语速稍慢",
    "闽南话，台湾口音，成年女性，声音清楚柔和，语气自然，语速正常",
    "闽南话，台湾口音，年轻男性，声音明亮，有精神，语速正常",
    "闽南话，台湾口音，年轻女性，声音轻松自然，语气亲切，语速正常",
]


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = Lock()

    def _job_path(self, job_id: str) -> Path:
        return JOB_ROOT / job_id / "job.json"

    def _persist(self, job: Job):
        path = self._job_path(job.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(job.model_dump_json(indent=2), encoding="utf-8")

    def load(self):
        with self._lock:
            self._jobs.clear()
            for job_path in JOB_ROOT.glob("*/job.json"):
                try:
                    job = Job.model_validate_json(job_path.read_text(encoding="utf-8"))
                    if job.status in {"queued", "running"}:
                        job = job.model_copy(update={
                            "status": "failed",
                            "stage": "Interrupted",
                            "progress": 100,
                            "error": "Server stopped before this job finished.",
                            "updated_at": time.time(),
                        })
                        self._persist(job)
                    self._jobs[job.id] = job
                except Exception:
                    continue

    def add(self, job: Job):
        with self._lock:
            self._jobs[job.id] = job
            self._persist(job)

    def get(self, job_id: str) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            return job.model_copy()

    def list(self) -> list[Job]:
        with self._lock:
            return [
                job.model_copy()
                for job in sorted(self._jobs.values(), key=lambda item: item.created_at, reverse=True)
            ]

    def update(self, job_id: str, **changes) -> Job:
        with self._lock:
            job = self._jobs[job_id].model_copy(update={**changes, "updated_at": time.time()})
            self._jobs[job_id] = job
            self._persist(job)
            return job

    def delete(self, job_id: str):
        with self._lock:
            if job_id not in self._jobs:
                raise HTTPException(status_code=404, detail="Job not found")
            job = self._jobs[job_id]
            if job.status == "running":
                raise HTTPException(status_code=409, detail="Running jobs cannot be deleted")
            del self._jobs[job_id]
        shutil.rmtree(JOB_ROOT / job_id, ignore_errors=True)


app_data = {"jobs": JobStore()}


def next_job_counter() -> int:
    global job_counter
    with job_counter_lock:
        job_counter += 1
        return job_counter


def enqueue_job(priority: int, job_id: str, payload: CreateJobRequest):
    job_queue.put((priority, next_job_counter(), job_id, payload))


def job_worker():
    while True:
        _, _, job_id, payload = job_queue.get()
        try:
            run_job(job_id, payload)
        finally:
            job_queue.task_done()


worker_thread = Thread(target=job_worker, daemon=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    JOB_ROOT.mkdir(parents=True, exist_ok=True)
    app_data["jobs"].load()
    if not worker_thread.is_alive():
        worker_thread.start()
    yield


app = FastAPI(title="Taigi Voice Video Web", lifespan=lifespan)

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


def web_token() -> Optional[str]:
    return os.environ.get("TAIGI_WEB_TOKEN")


def hash_secret(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def load_auth_store() -> dict:
    with auth_lock:
        if not AUTH_STORE.exists():
            return {"magic_tokens": {}, "sessions": {}}
        try:
            payload = json.loads(AUTH_STORE.read_text(encoding="utf-8"))
        except Exception:
            return {"magic_tokens": {}, "sessions": {}}
        payload.setdefault("magic_tokens", {})
        payload.setdefault("sessions", {})
        return payload


def load_settings() -> AppSettings:
    if not SETTINGS_PATH.exists():
        return AppSettings()
    try:
        return AppSettings.model_validate_json(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return AppSettings()


def save_settings(settings: AppSettings):
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(settings.model_dump_json(indent=2), encoding="utf-8")


def save_auth_store(payload: dict):
    with auth_lock:
        AUTH_STORE.parent.mkdir(parents=True, exist_ok=True)
        AUTH_STORE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def prune_auth_store(payload: dict):
    now = time.time()
    payload["magic_tokens"] = {
        token_hash: entry
        for token_hash, entry in payload.get("magic_tokens", {}).items()
        if entry.get("expires_at", 0) > now
    }
    payload["sessions"] = {
        token_hash: entry
        for token_hash, entry in payload.get("sessions", {}).items()
        if entry.get("expires_at", 0) > now
    }


def create_magic_token(email: str) -> str:
    token = secrets.token_urlsafe(32)
    payload = load_auth_store()
    prune_auth_store(payload)
    payload["magic_tokens"][hash_secret(token)] = {
        "email": email,
        "expires_at": time.time() + MAGIC_LINK_TTL_SECONDS,
    }
    save_auth_store(payload)
    return token


def create_admin_session(email: str) -> str:
    token = secrets.token_urlsafe(32)
    payload = load_auth_store()
    prune_auth_store(payload)
    payload["sessions"][hash_secret(token)] = {
        "email": email,
        "expires_at": time.time() + SESSION_TTL_SECONDS,
    }
    save_auth_store(payload)
    return token


def consume_magic_token(token: str) -> Optional[str]:
    payload = load_auth_store()
    prune_auth_store(payload)
    token_hash = hash_secret(token.strip())
    entry = payload.get("magic_tokens", {}).pop(token_hash, None)
    save_auth_store(payload)
    if not entry:
        return None
    email = entry.get("email", "").strip().lower()
    return email if email == ADMIN_EMAIL else None


def session_email(token: str) -> Optional[str]:
    payload = load_auth_store()
    prune_auth_store(payload)
    entry = payload.get("sessions", {}).get(hash_secret(token.strip()))
    if not entry:
        return None
    email = entry.get("email", "").strip().lower()
    return email if email == ADMIN_EMAIL else None


def revoke_session(token: Optional[str]):
    if not token:
        return
    payload = load_auth_store()
    payload.get("sessions", {}).pop(hash_secret(token.strip()), None)
    save_auth_store(payload)


def smtp_value(*names: str) -> Optional[str]:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def send_magic_link_email(to_email: str, login_url: str) -> bool:
    host = smtp_value("TAIGI_WEB_SMTP_HOST", "SMTP_RELAY_HOST")
    if not host:
        print(f"TAIGI WEB MAGIC LOGIN LINK for {to_email}: {login_url}", flush=True)
        return False
    port = int(smtp_value("TAIGI_WEB_SMTP_PORT", "SMTP_RELAY_PORT") or "587")
    user = smtp_value("TAIGI_WEB_SMTP_USER", "SMTP_RELAY_USER")
    password = smtp_value("TAIGI_WEB_SMTP_PASS", "SMTP_RELAY_PASS")
    from_email = smtp_value("TAIGI_WEB_FROM_EMAIL", "ASSISTANT_EMAIL", "SMTP_RELAY_USER") or user or to_email

    msg = EmailMessage()
    msg["Subject"] = "台語語音影片工具登入連結"
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(f"請點擊以下連結登入台語語音影片工具：\n\n{login_url}\n\n這個連結 15 分鐘內有效。")

    if port == 465:
        smtp = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        smtp = smtplib.SMTP(host, port, timeout=20)
        smtp.starttls()
    with smtp:
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
    return True


def is_loopback(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "::1", "localhost"}


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def is_private_client(request: Request) -> bool:
    host = client_ip(request)
    if host in {"localhost"}:
        return True
    try:
        parsed = ip_address(host)
    except ValueError:
        return False
    return parsed.is_private or parsed.is_loopback or parsed.is_link_local


def sentence_count(text: str) -> int:
    parts = [part for part in re.split(r"[。！？!?]+", text.strip()) if part.strip()]
    return max(1, len(parts)) if text.strip() else 0


def enforce_public_rate_limit(request: Request, text: str):
    if is_private_client(request):
        return
    limit_seconds = max(60, int(load_settings().public_rate_limit_seconds))
    if sentence_count(text) > 1:
        raise HTTPException(status_code=429, detail="Public users can submit only one sentence per job.")
    ip = client_ip(request) or "unknown"
    now = time.time()
    with rate_limit_lock:
        last = rate_limit_seen.get(ip, 0)
        remaining = limit_seconds - (now - last)
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Public rate limit: submit one sentence every {limit_seconds // 60} minutes. Try again in {int(remaining)} seconds.",
            )
        rate_limit_seen[ip] = now


def enforce_login_rate_limit(request: Request):
    ip = client_ip(request) or "unknown"
    key = f"login:{ip}"
    now = time.time()
    with rate_limit_lock:
        last = rate_limit_seen.get(key, 0)
        remaining = 60 - (now - last)
        if remaining > 0:
            raise HTTPException(status_code=429, detail=f"Please wait {int(remaining)} seconds before requesting another login link.")
        rate_limit_seen[key] = now


def is_authorized(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
) -> bool:
    admin_session = request.cookies.get(ADMIN_SESSION_COOKIE)
    if admin_session and session_email(admin_session) == ADMIN_EMAIL:
        return True
    token = web_token()
    if token:
        bearer = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
        return taigi_web_token_cookie == token or bearer == token
    settings_token = load_settings().api_access_token.strip()
    if settings_token and authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
        return secrets.compare_digest(bearer, settings_token)
    return not PUBLIC_ACCESS and is_loopback(request)


def require_auth(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if not is_authorized(request, taigi_web_token_cookie, authorization):
        raise HTTPException(status_code=401, detail="Private access required")


def job_is_public(job: Job) -> bool:
    return job.status == "complete"


def require_job_access(
    job: Job,
    request: Request,
    taigi_web_token_cookie: Optional[str] = None,
    authorization: Optional[str] = None,
):
    if job_is_public(job) or is_authorized(request, taigi_web_token_cookie, authorization):
        return
    raise HTTPException(status_code=401, detail="Private access required")


def content_disposition(filename: str) -> str:
    encoded = quote(filename, safe="")
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-") or "download"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def inline_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def title_from_text(text: str, limit: int = 48) -> str:
    cleaned = inline_text(text)
    first = re.split(r"(?<=[。！？!?])", cleaned, maxsplit=1)[0].strip() or cleaned
    return first[:limit] if len(first) > limit else first


def load_translation_memory() -> dict:
    with memory_lock:
        if not TRANSLATION_MEMORY.exists():
            return {"terms": {}, "feedback": []}
        try:
            payload = json.loads(TRANSLATION_MEMORY.read_text(encoding="utf-8"))
        except Exception:
            return {"terms": {}, "feedback": []}
        payload.setdefault("terms", {})
        payload.setdefault("feedback", [])
        return payload


def save_translation_memory(payload: dict):
    with memory_lock:
        TRANSLATION_MEMORY.parent.mkdir(parents=True, exist_ok=True)
        payload["updated_at"] = time.time()
        TRANSLATION_MEMORY.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def remember_feedback(job_id: str, segment_index: int, feedback: SegmentFeedback):
    memory = load_translation_memory()
    terms = memory.setdefault("terms", {})
    now = time.time()
    for correction in feedback.corrections:
        source = correction.source_phrase.strip()
        if not source:
            continue
        entry = terms.setdefault(source, {"source": source, "taigi": "", "tailo": "", "count": 0})
        if correction.taigi_correction.strip():
            entry["taigi"] = correction.taigi_correction.strip()
        if correction.tailo_correction.strip():
            entry["tailo"] = correction.tailo_correction.strip()
        entry["count"] = int(entry.get("count", 0)) + 1
        entry["updated_at"] = now
    memory.setdefault("feedback", []).append({
        "job_id": job_id,
        "segment_index": segment_index,
        "rating": feedback.rating,
        "note": feedback.note,
        "corrected_taigi_text": feedback.corrected_taigi_text,
        "corrected_tailo_text": feedback.corrected_tailo_text,
        "corrections": [item.model_dump() for item in feedback.corrections],
        "created_at": now,
    })
    save_translation_memory(memory)


def apply_translation_memory(text: str) -> str:
    memory = load_translation_memory()
    terms = memory.get("terms", {})
    for source, entry in sorted(terms.items(), key=lambda item: len(item[0]), reverse=True):
        target = (entry or {}).get("taigi") or ""
        if source and target:
            text = text.replace(source, target)
    return text


PHRASE_MAP = [
    ("大家好", "逐家好"),
    ("今天", "今仔日"),
    ("這個", "這个"),
    ("這一個", "這一个"),
    ("這支", "這支"),
    ("影片", "影片"),
    ("連結", "連結"),
    ("使用者", "使用者"),
    ("給我", "交予我"),
    ("幫我", "共我"),
    ("請我", "請我"),
    ("建立一個目錄", "開一个資料夾"),
    ("建立目錄", "開資料夾"),
    ("資料夾", "資料夾"),
    ("安裝", "安裝"),
    ("開源專案", "開源專案"),
    ("官方", "官方"),
    ("原始碼", "原始碼"),
    ("虛擬環境", "虛擬環境"),
    ("下載", "下載落來"),
    ("模型權重", "模型權重"),
    ("確認", "確認"),
    ("測試", "試看覓"),
    ("生成", "生成"),
    ("語音", "聲音"),
    ("音訊", "音訊"),
    ("字幕", "字幕"),
    ("波形", "波形"),
    ("頻譜", "頻譜"),
    ("工具", "工具"),
    ("流程", "流程"),
    ("執行", "予程式走起來"),
    ("啟用", "開啟"),
    ("工作排程", "工作排程"),
    ("網頁", "網頁"),
    ("中文稿", "中文稿"),
    ("台語稿", "台語稿"),
    ("翻譯", "翻做"),
    ("自然", "自然"),
    ("接著", "接紲"),
    ("後來", "後來"),
    ("最後", "最後"),
    ("如果", "若是"),
    ("可以", "會使"),
    ("不能", "毋通"),
    ("不是", "毋是"),
    ("我們", "咱"),
    ("把", "共"),
]


def translate_chinese_to_taigi(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    cleaned = apply_translation_memory(cleaned)
    for source, target in PHRASE_MAP:
        cleaned = cleaned.replace(source, target)
    replacements = {
        "的": "的",
        "了": "矣",
        "在": "佇",
        "和": "佮",
        "與": "佮",
        "也": "嘛",
        "再": "閣",
        "會": "會",
        "要": "欲",
        "讓": "予",
    }
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def build_segment_records(chinese_text: str, taigi_override: str, max_chars: int) -> list[dict]:
    source_segments = split_segments(chinese_text, max_chars)
    if taigi_override.strip():
        taigi_segments = split_segments(taigi_override.strip(), max_chars)
        if len(taigi_segments) < len(source_segments):
            taigi_segments.extend([""] * (len(source_segments) - len(taigi_segments)))
    else:
        taigi_segments = [translate_chinese_to_taigi(segment) for segment in source_segments]
    total = max(len(source_segments), len(taigi_segments))
    records = []
    for idx in range(total):
        source = source_segments[idx] if idx < len(source_segments) else ""
        taigi = taigi_segments[idx] if idx < len(taigi_segments) else ""
        if not taigi and source:
            taigi = translate_chinese_to_taigi(source)
        records.append({
            "index": idx + 1,
            "source_text": source,
            "taigi_text": taigi,
            "tailo_text": tailo_for(taigi),
            "audio_file": f"segments/seg_{idx + 1:02d}.wav",
            "rating": None,
            "feedback_count": 0,
        })
    return records


def tailo_for(text: str) -> str:
    if Converter is None:
        return ""
    try:
        return Converter(system="Tailo", dialect="south", format="mark").get(text)
    except Exception:
        return ""


def split_segments(text: str, max_chars: int) -> list[str]:
    sentences = [part.strip() for part in re.split(r"(?<=[。！？!?])\s*", text.strip()) if part.strip()]
    segments: list[str] = []
    current = ""
    for sentence in sentences:
        if not current:
            current = sentence
        elif len(current) + len(sentence) <= max_chars:
            current += sentence
        else:
            segments.append(current)
            current = sentence
    if current:
        segments.append(current)
    if not segments and text.strip():
        segments = [text.strip()]
    return segments


def duration(path: Path) -> float:
    output = subprocess.check_output(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return float(output.strip())


def run(cmd: list[str], cwd: Path = ROOT):
    subprocess.run(cmd, cwd=cwd, check=True)


def make_background(path: Path, title: str):
    width, height = 1920, 1080
    image = Image.new("RGB", (width, height), (8, 11, 18))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        color = (8 + int(y / height * 12), 11 + int(y / height * 21), 18 + int(y / height * 30))
        draw.line([(0, y), (width, y)], fill=color)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle([0, 0, width, 132], fill=(0, 0, 0, 96))
    od.rectangle([0, 710, width, height], fill=(0, 0, 0, 76))
    font_path = font_path_for_cjk()
    title_font = ImageFont.truetype(font_path, 56)
    small = ImageFont.truetype(font_path, 30)
    od.text((72, 42), title[:48], font=title_font, fill=(245, 248, 255, 255))
    od.text((72, 106), "中文稿轉台語稿 · VoxCPM 語音生成 · 字幕與音訊波形影片", font=small, fill=(178, 210, 220, 255))
    Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB").save(path)


def font_path_for_cjk() -> str:
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for item in candidates:
        if Path(item).exists():
            return item
    return candidates[-1]


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        if char == "\n":
            lines.append(current)
            current = ""
            continue
        test = current + char
        if font.getlength(test) <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def make_subtitle_png(path: Path, text: str, index: int, total: int):
    width, height = 1920, 1080
    font_path = font_path_for_cjk()
    font = ImageFont.truetype(font_path, 42)
    small = ImageFont.truetype(font_path, 30)
    lines = wrap_text(text, font, 1500)
    if len(lines) > 3:
        font = ImageFont.truetype(font_path, 36)
        lines = wrap_text(text, font, 1560)
    line_height = font.size + 18
    box_height = line_height * len(lines) + 52
    y0 = height - 250 - box_height // 2
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([150, y0, width - 150, y0 + box_height], radius=18, fill=(0, 0, 0, 174), outline=(0, 245, 255, 90), width=2)
    y = y0 + 26
    for line in lines:
        tw = draw.textlength(line, font=font)
        draw.text(((width - tw) / 2, y), line, font=font, fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0, 220))
        y += line_height
    label = f"{index:02d} / {total:02d}"
    draw.rounded_rectangle([width - 250, 40, width - 72, 92], radius=14, fill=(0, 0, 0, 120), outline=(255, 255, 255, 50), width=1)
    draw.text((width - 224, 50), label, font=small, fill=(206, 240, 245, 255))
    image.save(path)


def make_video(job_dir: Path, title: str, audio_path: Path, segments: list[dict]) -> Path:
    bg_path = job_dir / "background.png"
    make_background(bg_path, title)
    subtitle_paths = []
    for idx, segment in enumerate(segments, start=1):
        subtitle_path = job_dir / f"subtitle_{idx:02d}.png"
        make_subtitle_png(subtitle_path, segment["text"], idx, len(segments))
        subtitle_paths.append(subtitle_path)

    inputs = ["-loop", "1", "-i", str(bg_path), "-i", str(audio_path)]
    for subtitle_path in subtitle_paths:
        inputs += ["-loop", "1", "-i", str(subtitle_path)]

    filters = [
        "[1:a]showspectrum=s=1920x300:slide=scroll:mode=combined:color=rainbow:scale=sqrt:fps=30,format=rgba,colorchannelmixer=aa=0.50[spec]",
        "[1:a]showwaves=s=1920x410:mode=cline:rate=30:colors=00f5ff,format=rgba,split=2[w1][w2]",
        "[w2]gblur=sigma=18,colorchannelmixer=aa=0.46[glow]",
        "[0:v]scale=1920:1080,fps=30,format=rgba[bg]",
        "[bg][spec]overlay=0:710[tmp1]",
        "[tmp1][glow]overlay=0:328[tmp2]",
        "[tmp2][w1]overlay=0:328[v0]",
    ]
    last = "v0"
    for idx, segment in enumerate(segments, start=1):
        out = f"v{idx}"
        filters.append(
            f"[{last}][{idx + 1}:v]overlay=0:0:enable='between(t,{segment['start']:.3f},{segment['end']:.3f})'[{out}]"
        )
        last = out
    filters[-1] = filters[-1].replace(f"[{last}]", ",format=yuv420p[v]")

    video_path = job_dir / "taigi_video.mp4"
    cmd = [
        FFMPEG, "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart",
        str(video_path),
    ]
    run(cmd)
    return video_path


def make_archive(job_dir: Path) -> Path:
    zip_path = job_dir / "taigi_voice_video_job.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in job_dir.rglob("*"):
            if path.is_file() and path != zip_path:
                zf.write(path, path.relative_to(job_dir))
    return zip_path


def copy_to_onedrive(paths: list[Path]) -> Optional[Path]:
    dest = Path.home() / "Library" / "CloudStorage" / "OneDrive-Personal" / "Codex-VoxCPM-Taigi-Web"
    if not dest.parent.exists():
        return None
    dest.mkdir(parents=True, exist_ok=True)
    for path in paths:
        if path.exists():
            shutil.copy2(path, dest / path.name)
    return dest


def run_job(job_id: str, payload: CreateJobRequest):
    jobs: JobStore = app_data["jobs"]
    started_at = time.time()
    job_dir = JOB_ROOT / job_id
    output_dir = job_dir / "output"
    segments_dir = output_dir / "segments"
    output_dir.mkdir(parents=True, exist_ok=True)
    segments_dir.mkdir(parents=True, exist_ok=True)
    try:
        jobs.update(job_id, status="running", stage="Translating Chinese draft", progress=8, started_at=started_at)
        max_chars = max(40, min(payload.max_chars_per_segment, 180))
        segment_records = build_segment_records(payload.chinese_text, payload.taigi_override, max_chars)
        taigi_text = "\n".join(record["taigi_text"] for record in segment_records)
        tailo_text = "\n".join(record["tailo_text"] for record in segment_records)
        (output_dir / "source_chinese.txt").write_text(payload.chinese_text, encoding="utf-8")
        (output_dir / "taigi_draft.txt").write_text(taigi_text, encoding="utf-8")
        (output_dir / "tailo.txt").write_text(tailo_text, encoding="utf-8")
        jobs.update(job_id, taigi_text=taigi_text, tailo_text=tailo_text, stage="Splitting script", progress=15)

        if not segment_records:
            raise ValueError("No text to synthesize.")
        for record in segment_records:
            idx = record["index"]
            (segments_dir / f"seg_{idx:02d}.source.txt").write_text(record["source_text"], encoding="utf-8")
            (segments_dir / f"seg_{idx:02d}.txt").write_text(record["taigi_text"], encoding="utf-8")
            (segments_dir / f"seg_{idx:02d}.tailo.txt").write_text(record["tailo_text"], encoding="utf-8")
        jobs.update(job_id, segment_count=len(segment_records), stage=f"Generating {len(segment_records)} audio segments", progress=20)

        voice_mode = payload.reference_voice_mode or load_settings().default_reference_voice_mode
        voice_control = payload.control
        reference_audio: Optional[Path] = None
        if voice_mode == "default":
            reference_audio = DEFAULT_REFERENCE_AUDIO.expanduser()
            if not reference_audio.exists():
                raise FileNotFoundError(f"Reference audio not found: {reference_audio}")
        else:
            voice_control = random.choice(RANDOM_VOICE_CONTROLS)
        (output_dir / "voice_mode.txt").write_text(voice_mode, encoding="utf-8")
        (output_dir / "voice_control.txt").write_text(voice_control, encoding="utf-8")

        wav_paths: list[Path] = []
        for record in segment_records:
            idx = record["index"]
            progress = 20 + int((idx - 1) / len(segment_records) * 50)
            jobs.update(job_id, stage=f"Generating audio segment {idx}/{len(segment_records)}", progress=progress)
            wav_path = segments_dir / f"seg_{idx:02d}.wav"
            cmd = [
                VOXCPM_BIN, "clone" if voice_mode == "default" else "design",
                "--text", record["taigi_text"],
                "--control", voice_control,
                "--output", str(wav_path),
                "--device", payload.device,
                "--cache-dir", str(CACHE_DIR),
                "--no-denoiser",
                "--local-files-only",
                "--inference-timesteps", str(payload.inference_timesteps),
                "--cfg-value", str(payload.cfg_value),
            ]
            if reference_audio:
                cmd.extend(["--reference-audio", str(reference_audio)])
            run(cmd)
            record["audio_file"] = f"segments/{wav_path.name}"
            wav_paths.append(wav_path)

        jobs.update(job_id, stage="Joining audio", progress=72)
        concat_path = segments_dir / "concat.txt"
        concat_path.write_text("".join(f"file '{path.name}'\n" for path in wav_paths), encoding="utf-8")
        audio_path = output_dir / "taigi_voice.wav"
        run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path.name), "-c", "copy", str(audio_path)], cwd=segments_dir)

        jobs.update(job_id, stage="Preparing subtitles", progress=78)
        timeline = []
        cursor = 0.0
        for record, wav_path in zip(segment_records, wav_paths):
            dur = duration(wav_path)
            record["duration"] = dur
            record["start"] = cursor
            record["end"] = cursor + dur
            timeline.append({
                "index": record["index"],
                "start": cursor,
                "end": cursor + dur,
                "duration": dur,
                "text": record["taigi_text"],
                "source_text": record["source_text"],
                "tailo_text": record["tailo_text"],
                "audio_file": record["audio_file"],
            })
            cursor += dur
        (output_dir / "subtitles.json").write_text(json.dumps({"duration": cursor, "segments": timeline}, ensure_ascii=False, indent=2), encoding="utf-8")
        (output_dir / "segments.json").write_text(json.dumps({"segments": segment_records}, ensure_ascii=False, indent=2), encoding="utf-8")

        video_path = None
        if payload.make_video:
            jobs.update(job_id, stage="Rendering waveform video", progress=84)
            video_path = make_video(output_dir, payload.title, audio_path, timeline)

        jobs.update(job_id, stage="Packaging outputs", progress=94)
        zip_path = make_archive(output_dir)
        onedrive_dir = None
        if payload.copy_to_onedrive:
            paths = [
                audio_path,
                output_dir / "taigi_draft.txt",
                output_dir / "tailo.txt",
                output_dir / "subtitles.json",
                output_dir / "segments.json",
                zip_path,
            ]
            if video_path:
                paths.append(video_path)
            onedrive_dir = copy_to_onedrive(paths)

        completed_at = time.time()
        jobs.update(
            job_id,
            status="complete",
            stage="Complete",
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
            output_dir=str(output_dir),
            audio_path=str(audio_path),
            video_path=str(video_path) if video_path else None,
            zip_path=str(zip_path),
            onedrive_dir=str(onedrive_dir) if onedrive_dir else None,
        )
    except Exception as exc:
        completed_at = time.time()
        jobs.update(
            job_id,
            status="failed",
            stage="Failed",
            error=str(exc),
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )


def dist_index() -> Optional[FileResponse]:
    index = FRONTEND_DIST / "index.html"
    return FileResponse(index) if index.exists() else None


@app.get("/", response_class=HTMLResponse)
async def root():
    dist = dist_index()
    if dist:
        return dist
    return HTMLResponse("<h1>Taigi Voice Video Web</h1><p>Build the frontend with npm run build.</p>")


@app.post("/auth")
async def auth(token: Annotated[str, Form()]):
    expected = web_token()
    if not expected or token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")
    response = JSONResponse({"authenticated": True})
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict")
    return response


@app.post("/auth/magic-link")
async def request_magic_link(payload: MagicLinkRequest, request: Request):
    email = payload.email.strip().lower()
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only the configured admin email can sign in.")
    enforce_login_rate_limit(request)
    token = create_magic_token(email)
    login_url = f"{PUBLIC_URL}/?{urlencode({'token': token})}"
    try:
        delivered = send_magic_link_email(email, login_url)
    except Exception as exc:
        print(f"Failed to send Taigi magic link email: {exc}. Login URL: {login_url}", flush=True)
        delivered = False
    return {"ok": True, "delivered": delivered}


@app.post("/auth/verify")
async def verify_magic_link(payload: VerifyMagicLinkRequest, request: Request):
    email = consume_magic_token(payload.token)
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=401, detail="Invalid or expired login link.")
    session = create_admin_session(email)
    response = JSONResponse({"authenticated": True, "email": email})
    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        session,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=request.headers.get("x-forwarded-proto", request.url.scheme) == "https",
        samesite="lax",
    )
    return response


@app.post("/auth/logout")
async def logout(request: Request):
    revoke_session(request.cookies.get(ADMIN_SESSION_COOKIE))
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE)
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return response


@app.get("/auth/status")
async def auth_status(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    return {
        "authenticated": is_authorized(request, taigi_web_token_cookie, authorization),
        "token_required": True,
        "loopback_only": not PUBLIC_ACCESS and not bool(web_token()),
        "public_access": PUBLIC_ACCESS,
        "auth_method": "email_magic_link",
    }


@app.get("/api/info")
async def api_info():
    settings = load_settings()
    info = {
        "name": "Taigi Voice Video Web",
        "default_device": DEFAULT_DEVICE,
        "default_copy_to_onedrive": DEFAULT_COPY_TO_ONEDRIVE,
        "default_reference_voice_mode": settings.default_reference_voice_mode,
        "public_rate_limit_seconds": settings.public_rate_limit_seconds,
        "public_access": PUBLIC_ACCESS,
        "reference_voice_modes": [
            {"value": "default", "label": "預設聲音"},
            {"value": "random", "label": "隨機生成"},
        ],
        "pipeline": ["translate", "segment", "tts", "join", "subtitle", "video", "package"],
    }
    if not PUBLIC_ACCESS:
        info["job_dir"] = str(JOB_ROOT)
        info["translation_memory"] = str(TRANSLATION_MEMORY)
    return info


@app.get("/admin/settings")
async def get_admin_settings(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    return load_settings()


@app.put("/admin/settings")
async def update_admin_settings(
    settings: AppSettings,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    normalized = settings.model_copy(update={
        "public_rate_limit_seconds": max(60, int(settings.public_rate_limit_seconds)),
        "api_access_token": settings.api_access_token.strip(),
    })
    save_settings(normalized)
    return normalized


@app.post("/jobs")
async def create_job(
    payload: CreateJobRequest,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    if not PUBLIC_ACCESS and not admin_or_token:
        require_auth(request, taigi_web_token_cookie, authorization)
    if not payload.chinese_text.strip():
        raise HTTPException(status_code=400, detail="Chinese text is required")
    if not admin_or_token and not is_private_client(request):
        enforce_public_rate_limit(request, payload.chinese_text)
    job_id = uuid.uuid4().hex
    payload_title = payload.title.strip()
    display_title = title_from_text(payload.chinese_text) if payload_title in {"", "台語語音影片"} else payload_title
    job = Job(
        id=job_id,
        title=display_title or "台語語音影片",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=time.time(),
        updated_at=time.time(),
        chinese_text=payload.chinese_text,
    )
    app_data["jobs"].add(job)
    enqueue_job(0 if is_private_client(request) or admin_or_token else 10, job_id, payload)
    return job


@app.get("/jobs")
async def list_jobs(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    jobs = app_data["jobs"].list()
    if not admin_or_token:
        jobs = [job for job in jobs if job_is_public(job)]
    return {"jobs": jobs}


@app.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    return job


@app.get("/jobs/{job_id}/segments")
async def get_job_segments(
    job_id: str,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    output_dir = Path(job.output_dir or JOB_ROOT / job_id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        return {"segments": [], "reviews": []}
    payload = json.loads(segments_path.read_text(encoding="utf-8"))
    reviews_path = output_dir / "reviews.json"
    reviews = []
    if reviews_path.exists():
        reviews = json.loads(reviews_path.read_text(encoding="utf-8")).get("reviews", [])
    return {"segments": payload.get("segments", []), "reviews": reviews}


@app.post("/jobs/{job_id}/segments/{segment_index}/feedback")
async def save_segment_feedback(
    job_id: str,
    segment_index: int,
    feedback: SegmentFeedback,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if feedback.rating < 1 or feedback.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    output_dir = Path(job.output_dir or JOB_ROOT / job_id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        raise HTTPException(status_code=404, detail="Segments not found")

    reviews_path = output_dir / "reviews.json"
    reviews_payload = {"reviews": []}
    if reviews_path.exists():
        reviews_payload = json.loads(reviews_path.read_text(encoding="utf-8"))
        reviews_payload.setdefault("reviews", [])
    review = {
        "segment_index": segment_index,
        "rating": feedback.rating,
        "note": feedback.note,
        "corrected_taigi_text": feedback.corrected_taigi_text,
        "corrected_tailo_text": feedback.corrected_tailo_text,
        "corrections": [item.model_dump() for item in feedback.corrections],
        "created_at": time.time(),
    }
    reviews_payload["reviews"].append(review)
    reviews_path.write_text(json.dumps(reviews_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    segments_payload = json.loads(segments_path.read_text(encoding="utf-8"))
    for segment in segments_payload.get("segments", []):
        if segment.get("index") == segment_index:
            segment["rating"] = feedback.rating
            segment["feedback_count"] = int(segment.get("feedback_count") or 0) + 1
            if feedback.corrected_taigi_text.strip():
                segment["corrected_taigi_text"] = feedback.corrected_taigi_text.strip()
            if feedback.corrected_tailo_text.strip():
                segment["corrected_tailo_text"] = feedback.corrected_tailo_text.strip()
            break
    segments_path.write_text(json.dumps(segments_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    remember_feedback(job_id, segment_index, feedback)
    return {"saved": True, "review": review}


@app.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    app_data["jobs"].delete(job_id)
    return {"deleted": True}


@app.get("/jobs/{job_id}/download/{kind}")
async def download_job_file(
    job_id: str,
    kind: Literal["zip", "audio", "video", "taigi", "tailo", "subtitles", "segments"],
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail="Job is not complete")
    output_dir = Path(job.output_dir or "")
    files = {
        "zip": Path(job.zip_path or ""),
        "audio": Path(job.audio_path or ""),
        "video": Path(job.video_path or ""),
        "taigi": output_dir / "taigi_draft.txt",
        "tailo": output_dir / "tailo.txt",
        "subtitles": output_dir / "subtitles.json",
        "segments": output_dir / "segments.json",
    }
    path = files[kind]
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Output file not found")
    return FileResponse(path, headers={"Content-Disposition": content_disposition(path.name)})


@app.get("/jobs/{job_id}/segments/{segment_index}/audio")
async def download_segment_audio(
    job_id: str,
    segment_index: int,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    output_dir = Path(job.output_dir or "")
    path = output_dir / "segments" / f"seg_{segment_index:02d}.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Segment audio not found")
    return FileResponse(path, media_type="audio/wav", headers={"Content-Disposition": content_disposition(path.name)})
