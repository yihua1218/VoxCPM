import json
import os
import random
import re
import secrets
import sqlite3
import smtplib
import shutil
import subprocess
import time
import traceback
import urllib.error
import urllib.request
import uuid
import zipfile
from contextlib import asynccontextmanager
from email.message import EmailMessage
from email.utils import formatdate
from html import escape as xml_escape
from hashlib import sha256
from ipaddress import ip_address
from pathlib import Path
from queue import PriorityQueue
from threading import Lock, Thread
from typing import Annotated, Callable, Literal, Optional
from urllib.parse import quote, urlencode

from fastapi import Cookie, FastAPI, Form, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response as FastAPIResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

try:
    from taibun import Converter
except Exception:  # pragma: no cover
    Converter = None

try:
    import jieba
except Exception:  # pragma: no cover
    jieba = None

try:
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
except Exception:  # pragma: no cover
    psycopg = None
    sql = None
    Jsonb = None


ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip().strip('"').strip("'")
        os.environ[key] = value


load_env_file(ROOT / ".env")

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
WORD_DB = Path(os.environ.get("TAIGI_WEB_WORD_DB", JOB_ROOT / "word_db.json"))
WORD_ASSET_DIR = Path(os.environ.get("TAIGI_WEB_WORD_ASSET_DIR", JOB_ROOT / "word_assets"))
WORD_AUTO_GENERATE_INTERVAL_SECONDS = int(os.environ.get("TAIGI_WEB_WORD_AUTO_GENERATE_INTERVAL_SECONDS", "1800"))
ENABLE_BREEZE_ASR = os.environ.get("TAIGI_WEB_ENABLE_BREEZE_ASR", "0").lower() in {"1", "true", "yes", "on"}
BREEZE_ASR_MODEL = os.environ.get("TAIGI_WEB_BREEZE_ASR_MODEL", "MediaTek-Research/Breeze-ASR-26").strip()
ENABLE_MMS_TTS = os.environ.get("TAIGI_WEB_ENABLE_MMS_TTS", "0").lower() in {"1", "true", "yes", "on"}
MMS_TTS_MODEL = os.environ.get("TAIGI_WEB_MMS_TTS_MODEL", "facebook/mms-tts-nan").strip()
SUBPROCESS_TIMEOUT_SECONDS = int(os.environ.get("TAIGI_WEB_SUBPROCESS_TIMEOUT_SECONDS", "600"))
VIDEO_RENDER_TIMEOUT_SECONDS = int(os.environ.get("TAIGI_WEB_VIDEO_RENDER_TIMEOUT_SECONDS", "1800"))
COMMAND_HEARTBEAT_SECONDS = int(os.environ.get("TAIGI_WEB_COMMAND_HEARTBEAT_SECONDS", "30"))
RUNNING_JOB_STALE_SECONDS = int(os.environ.get("TAIGI_WEB_RUNNING_JOB_STALE_SECONDS", "1800"))
JOB_WATCHDOG_INTERVAL_SECONDS = int(os.environ.get("TAIGI_WEB_JOB_WATCHDOG_INTERVAL_SECONDS", "60"))
DATA_CLEANUP_INTERVAL_SECONDS = int(os.environ.get("TAIGI_WEB_DATA_CLEANUP_INTERVAL_SECONDS", "86400"))
STATS_PATH = Path(os.environ.get("TAIGI_WEB_STATS", JOB_ROOT / "stats.json"))
SQLITE_DB = Path(os.environ.get("TAIGI_WEB_SQLITE_DB", JOB_ROOT / "taigi_web.sqlite3"))
PUBLIC_STATIC_DIR = Path(os.environ.get("TAIGI_WEB_PUBLIC_STATIC_DIR", JOB_ROOT / "public_static"))
PUBLIC_STATIC_URL = os.environ.get("TAIGI_WEB_PUBLIC_STATIC_URL", "/static-data").rstrip("/")

UNSAFE_TTS_CHARS = {
    "\u180e": "Mongolian vowel separator",
    "\u200b": "zero width space",
    "\u200c": "zero width non-joiner",
    "\u200d": "zero width joiner",
    "\u2060": "word joiner",
    "\ufeff": "byte order mark",
    "\ufffc": "object replacement character",
    "\ufffd": "replacement character",
}
UNSAFE_TTS_TRANSLATION = str.maketrans({char: "" for char in UNSAFE_TTS_CHARS})


def sanitize_text_for_tts(text: str) -> str:
    if not text:
        return text
    return text.translate(UNSAFE_TTS_TRANSLATION)


def sanitize_state_value(value):
    if isinstance(value, str):
        cleaned = sanitize_text_for_tts(value)
        return cleaned, sum(value.count(char) for char in UNSAFE_TTS_CHARS)
    if isinstance(value, list):
        changed_count = 0
        cleaned_items = []
        for item in value:
            cleaned_item, count = sanitize_state_value(item)
            cleaned_items.append(cleaned_item)
            changed_count += count
        return cleaned_items, changed_count
    if isinstance(value, dict):
        changed_count = 0
        cleaned_payload = {}
        for key, item in value.items():
            cleaned_key, key_count = sanitize_state_value(key)
            cleaned_item, item_count = sanitize_state_value(item)
            cleaned_payload[cleaned_key] = cleaned_item
            changed_count += key_count + item_count
        return cleaned_payload, changed_count
    return value, 0
OBJECT_STORAGE_BUCKET = os.environ.get("TAIGI_WEB_OBJECT_STORAGE_BUCKET", "").strip()
OBJECT_STORAGE_PREFIX = os.environ.get("TAIGI_WEB_OBJECT_STORAGE_PREFIX", "taigi-public").strip().strip("/")
OBJECT_STORAGE_ENDPOINT_URL = os.environ.get("TAIGI_WEB_OBJECT_STORAGE_ENDPOINT_URL", "").strip().rstrip("/")
OBJECT_STORAGE_REGION = os.environ.get("TAIGI_WEB_OBJECT_STORAGE_REGION", "").strip()
OBJECT_STORAGE_PROFILE = os.environ.get("TAIGI_WEB_OBJECT_STORAGE_PROFILE", "").strip()
PUBLIC_ACCESS = os.environ.get("TAIGI_WEB_PUBLIC_ACCESS", "1").lower() not in {"0", "false", "no", "off"}
SESSION_COOKIE = "taigi_web_token"
ADMIN_SESSION_COOKIE = "taigi_admin_session"
REVIEWER_COOKIE = "taigi_reviewer_id"
ADMIN_EMAIL = (os.environ.get("TAIGI_WEB_ADMIN_EMAIL") or os.environ.get("ADMIN_EMAIL") or "yihua1218@gmail.com").strip().lower()
PUBLIC_URL = os.environ.get("TAIGI_WEB_PUBLIC_URL") or os.environ.get("PUBLIC_URL") or "https://taigi.yihua.app"
AUTH_STORE = JOB_ROOT / "auth_store.json"
MAGIC_LINK_TTL_SECONDS = int(os.environ.get("TAIGI_WEB_MAGIC_LINK_TTL_SECONDS", "900"))
SESSION_TTL_SECONDS = int(os.environ.get("TAIGI_WEB_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 30)))
memory_lock = Lock()
auth_lock = Lock()
rate_limit_lock = Lock()
word_db_lock = Lock()
stats_lock = Lock()
db_lock = Lock()
snapshot_lock = Lock()
snapshot_scheduled = False
rate_limit_seen: dict[str, float] = {}
job_queue: PriorityQueue = PriorityQueue()
job_counter_lock = Lock()
job_counter = 0
RATE_LIMIT_SECONDS = int(os.environ.get("TAIGI_WEB_PUBLIC_JOB_INTERVAL_SECONDS", "3600"))
PUBLIC_ANONYMOUS_MAX_CHARS = int(os.environ.get("TAIGI_WEB_PUBLIC_ANONYMOUS_MAX_CHARS", "1200"))
POSTGRES_DSN = os.environ.get("TAIGI_WEB_POSTGRES_DSN", "").strip()
POSTGRES_SCHEMA = os.environ.get("TAIGI_WEB_POSTGRES_SCHEMA", "public").strip() or "public"
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

    def model_post_init(self, __context):
        for field in ("title", "chinese_text", "taigi_override", "control"):
            value = getattr(self, field)
            if isinstance(value, str):
                setattr(self, field, sanitize_text_for_tts(value))


class MagicLinkRequest(BaseModel):
    email: str


class VerifyMagicLinkRequest(BaseModel):
    token: str


class AnonymousNicknameRequest(BaseModel):
    nickname: str


def env_choice(name: str, default: str, choices: set[str]) -> str:
    value = os.environ.get(name, default).strip() or default
    return value if value in choices else default


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)) or default)
    except ValueError:
        return default


class AppSettings(BaseModel):
    default_reference_voice_mode: Literal["default", "random"] = "default"
    public_rate_limit_seconds: int = RATE_LIMIT_SECONDS
    api_access_token: str = ""
    postgres_dsn: str = POSTGRES_DSN
    postgres_schema: str = POSTGRES_SCHEMA
    translator_backend: Literal["rule", "tw_hokkien_llm"] = env_choice("TAIGI_WEB_TRANSLATOR_BACKEND", "rule", {"rule", "tw_hokkien_llm"})
    translator_api_base_url: str = os.environ.get("TAIGI_WEB_TRANSLATOR_API_BASE_URL", "").strip()
    translator_api_key: str = os.environ.get("TAIGI_WEB_TRANSLATOR_API_KEY", "").strip()
    translator_model: str = os.environ.get("TAIGI_WEB_TRANSLATOR_MODEL", "").strip()
    translator_target_language: Literal["HAN", "HL", "POJ"] = env_choice("TAIGI_WEB_TRANSLATOR_TARGET_LANGUAGE", "HAN", {"HAN", "HL", "POJ"})
    translator_timeout_seconds: int = env_int("TAIGI_WEB_TRANSLATOR_TIMEOUT_SECONDS", 90)
    llm_api_base_url: str = os.environ.get("TAIGI_WEB_LLM_API_BASE_URL", "").strip()
    llm_api_key: str = os.environ.get("TAIGI_WEB_LLM_API_KEY", "").strip()
    llm_model: str = os.environ.get("TAIGI_WEB_LLM_MODEL", "").strip()
    object_storage_bucket: str = OBJECT_STORAGE_BUCKET
    object_storage_prefix: str = OBJECT_STORAGE_PREFIX
    object_storage_endpoint_url: str = OBJECT_STORAGE_ENDPOINT_URL
    object_storage_region: str = OBJECT_STORAGE_REGION
    object_storage_profile: str = OBJECT_STORAGE_PROFILE
    object_storage_public_url: str = PUBLIC_STATIC_URL


class RandomSentenceRequest(BaseModel):
    topic: str = ""
    style: str = "daily"
    length: Literal["short", "medium"] = "short"


class RandomSentenceResponse(BaseModel):
    title: str
    chinese_text: str
    source: Literal["llm", "fallback"]
    model: str = ""


class PostgresExportResult(BaseModel):
    exported: bool
    schema_name: str
    kv_rows: int
    job_rows: int
    exported_at: float


class StaticSyncResult(BaseModel):
    synced: bool
    bucket: str
    prefix: str
    destination: str
    file_count: int
    byte_count: int
    synced_at: float
    public_url: str = ""


class Job(BaseModel):
    id: str
    kind: Literal["script", "word_asset", "segment_regeneration", "maintenance", "audio_review"] = "script"
    owner_id: Optional[str] = None
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
    problem: bool = False
    problem_type: str = ""
    problem_reason: str = ""
    problem_reported_at: Optional[float] = None
    problem_reported_by: str = ""
    featured_at: Optional[float] = None
    featured_by: str = ""
    featured_note: str = ""
    metadata: dict = Field(default_factory=dict)


class SegmentCorrection(BaseModel):
    source_phrase: str = ""
    taigi_correction: str = ""
    tailo_correction: str = ""
    note: str = ""
    status: Literal["", "problem", "ok"] = ""


class SegmentFeedback(BaseModel):
    rating: int
    note: str = ""
    corrected_taigi_text: str = ""
    corrected_tailo_text: str = ""
    corrections: list[SegmentCorrection] = []


class SegmentBatchRegenerateRequest(BaseModel):
    only_with_corrections: bool = False


class RetryJobRequest(BaseModel):
    mode: Literal["restart", "resume"] = "restart"


class WordIssueRequest(BaseModel):
    reason: str = ""
    issue_type: str = ""


class WordCreateRequest(BaseModel):
    source: str
    taigi: str = ""
    tailo: str = ""
    note: str = ""


class WordRatingRequest(BaseModel):
    rating: int
    note: str = ""


class WordAssetRatingRequest(BaseModel):
    rating: int
    note: str = ""


class WordGenerateRequest(BaseModel):
    synthesis_source: Literal["taigi", "tailo"] = "taigi"


class WordItaigiReferenceApplyRequest(BaseModel):
    taigi: str
    tailo: str
    audio_url: str = ""
    source_url: str = ""
    good: int = 0
    bad: int = 0


class WordTokenReviewItem(BaseModel):
    source: str
    status: Literal["problem", "ok"]


class WordTokenReviewRequest(BaseModel):
    tokens: list[WordTokenReviewItem] = []


class WordTranslationRequest(BaseModel):
    languages: list[str] = []
    overwrite: bool = False


class AudioReviewRequest(BaseModel):
    run_asr: bool = True
    generate_mms: bool = False


class SegmentRegenerateRequest(SegmentFeedback):
    synthesis_source: Literal["auto", "taigi", "tailo"] = "auto"


class SourceExportRequest(BaseModel):
    languages: list[str] = []
    format: Literal["json", "sqlite", "csv"] = "json"
    note: str = ""


class JobRatingRequest(BaseModel):
    rating: int
    note: str = ""


class JobIssueRequest(BaseModel):
    status: Literal["problem", "ok"]
    reason: str = ""
    issue_type: str = ""


class JobFeaturedRequest(BaseModel):
    featured: bool
    note: str = ""


class TermBatchRegenerateRequest(BaseModel):
    search_term: str
    taigi_replacement: str
    dry_run: bool = True
    max_jobs: int = 50


class StatActionRequest(BaseModel):
    action: str
    target_type: str = ""
    target_id: str = ""
    metadata: dict = {}


FIXED_PHRASE_SEEDS = [
    {"source": "一兼二顧", "taigi": "一兼二顧", "tailo": "tsi̍t ki兼 nn̄g kòo", "category": "俗語", "note": "一件事同時照顧兩種目的。"},
    {"source": "食果子拜樹頭", "taigi": "食果子拜樹頭", "tailo": "tsia̍h kué-tsí pài tshiū-thâu", "category": "俗諺", "note": "飲水思源。"},
    {"source": "有燒香有保庇", "taigi": "有燒香有保庇", "tailo": "ū sio-hiunn ū pó-pì", "category": "俗用", "note": "有準備、有做功課較安心。"},
    {"source": "慢慢仔來", "taigi": "慢慢仔來", "tailo": "bān-bān-á lâi", "category": "固定語句", "note": "不用急，慢慢來。"},
    {"source": "歹勢", "taigi": "歹勢", "tailo": "pháinn-sè", "category": "常用語", "note": "不好意思、抱歉。"},
    {"source": "袂䆀", "taigi": "袂䆀", "tailo": "bē-bái", "category": "常用語", "note": "不錯。"},
    {"source": "毋免客氣", "taigi": "毋免客氣", "tailo": "m̄-bián kheh-khì", "category": "固定語句", "note": "不用客氣。"},
    {"source": "逐家好", "taigi": "逐家好", "tailo": "ta̍k-ke-hó", "category": "固定語句", "note": "大家好。"},
    {"source": "早安", "taigi": "早安", "tailo": "tsá-an", "category": "常用語", "note": "早安。"},
    {"source": "有影無", "taigi": "有影無", "tailo": "ū-iánn-bô", "category": "俗用", "note": "真的假的？"},
    {"source": "講予逐家聽", "taigi": "講予逐家聽", "tailo": "kóng hōo ta̍k-ke thiann", "category": "固定語句", "note": "說給大家聽。"},
    {"source": "愈來愈", "taigi": "愈來愈", "tailo": "jú-lâi-jú", "category": "固定語句", "note": "越來越。"},
]


ANON_TAIGI_NICKNAMES = [
    "海口阿明",
    "山線阿蘭",
    "府城阿和",
    "艋舺阿月",
    "打狗阿志",
    "鹿港阿珠",
    "諸羅阿賢",
    "蘭陽阿琴",
    "笨港阿義",
    "大稻埕阿美",
    "鳳山阿昌",
    "彰化阿敏",
    "淡水阿清",
    "埔里阿惠",
    "恆春阿良",
    "斗六阿芳",
]


RANDOM_VOICE_CONTROLS = [
    "闽南话，台湾口音，成年男性，声音温和自然，语速正常，像广播旁白",
    "闽南话，台湾口音，成年男性，声音低沉稳定，语气亲切，语速稍慢",
    "闽南话，台湾口音，成年女性，声音清楚柔和，语气自然，语速正常",
    "闽南话，台湾口音，年轻男性，声音明亮，有精神，语速正常",
    "闽南话，台湾口音，年轻女性，声音轻松自然，语气亲切，语速正常",
]

VOICE_CONTROL_OPTIONS = [
    {
        "value": "default_male",
        "label": "預設男聲，台灣口音，自然語速",
        "prompt": "闽南话，台湾口音，语气自然，语速正常，保持参考音频的男声音色和说话方式",
    },
    {
        "value": "warm_male",
        "label": "溫和男聲，像廣播旁白",
        "prompt": "闽南话，台湾口音，成年男性，声音温和自然，语速正常，像广播旁白",
    },
    {
        "value": "low_male",
        "label": "低沉男聲，穩定親切，稍慢",
        "prompt": "闽南话，台湾口音，成年男性，声音低沉稳定，语气亲切，语速稍慢",
    },
    {
        "value": "clear_female",
        "label": "清楚女聲，柔和自然",
        "prompt": "闽南话，台湾口音，成年女性，声音清楚柔和，语气自然，语速正常",
    },
    {
        "value": "bright_young_male",
        "label": "年輕男聲，明亮有精神",
        "prompt": "闽南话，台湾口音，年轻男性，声音明亮，有精神，语速正常",
    },
    {
        "value": "friendly_young_female",
        "label": "年輕女聲，輕鬆親切",
        "prompt": "闽南话，台湾口音，年轻女性，声音轻松自然，语气亲切，语速正常",
    },
]


def resolve_voice_control(control: str) -> str:
    for option in VOICE_CONTROL_OPTIONS:
        if control == option["value"]:
            return option["prompt"]
    return control


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = Lock()

    def _job_path(self, job_id: str) -> Path:
        return JOB_ROOT / job_id / "job.json"

    def _persist(self, job: Job):
        db_save_job(job)
        path = self._job_path(job.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload, _ = sanitize_state_value(job.model_dump())
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if job.status in {"complete", "failed"}:
            schedule_public_snapshot_export()

    def load(self):
        with self._lock:
            self._jobs.clear()
            for job in db_load_jobs():
                if job.status == "running":
                    job = job.model_copy(update={
                        "status": "failed",
                        "stage": "Interrupted",
                        "progress": 100,
                        "error": "Server stopped before this job finished.",
                        "updated_at": time.time(),
                    })
                    self._persist(job)
                self._jobs[job.id] = job
            for job_path in JOB_ROOT.glob("*/job.json"):
                try:
                    job = Job.model_validate_json(job_path.read_text(encoding="utf-8"))
                    if job.id in self._jobs:
                        continue
                    if job.status == "running":
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
            db_delete_job(job_id)
        shutil.rmtree(JOB_ROOT / job_id, ignore_errors=True)
        schedule_public_snapshot_export()


def db_connect() -> sqlite3.Connection:
    SQLITE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at REAL NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at REAL NOT NULL)")
    conn.commit()
    return conn


def db_get_json(key: str, default):
    with db_lock, db_connect() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except Exception:
            return default


def db_has_json(key: str) -> bool:
    with db_lock, db_connect() as conn:
        row = conn.execute("SELECT 1 FROM kv WHERE key = ?", (key,)).fetchone()
        return bool(row)


def db_set_json(key: str, value):
    value, _ = sanitize_state_value(value)
    with db_lock, db_connect() as conn:
        conn.execute(
            "INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, json.dumps(value, ensure_ascii=False), time.time()),
        )
        conn.commit()


def json_state_key(path: Path) -> str:
    path = path.resolve()
    try:
        relative = path.relative_to(JOB_ROOT.resolve())
        return f"file:{relative.as_posix()}"
    except ValueError:
        return f"file:{sha256(str(path).encode('utf-8')).hexdigest()}:{path.name}"


def write_json_file(path: Path, payload: dict):
    payload, _ = sanitize_state_value(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def load_json_state(path: Path, default: dict, *, key: Optional[str] = None, create: bool = False) -> dict:
    state_key = key or json_state_key(path)
    stored = db_get_json(state_key, None)
    if stored is not None:
        if not path.exists():
            write_json_file(path, stored)
        return stored
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            payload = default
        db_set_json(state_key, payload)
        return payload
    if create:
        save_json_state(path, default, key=state_key)
    return default


def save_json_state(path: Path, payload: dict, *, key: Optional[str] = None):
    state_key = key or json_state_key(path)
    db_set_json(state_key, payload)
    write_json_file(path, payload)


def db_load_jobs() -> list[Job]:
    with db_lock, db_connect() as conn:
        rows = conn.execute("SELECT value FROM jobs").fetchall()
    jobs = []
    for row in rows:
        try:
            jobs.append(Job.model_validate_json(row["value"]))
        except Exception:
            continue
    return jobs


def db_save_job(job: Job):
    payload, _ = sanitize_state_value(job.model_dump())
    with db_lock, db_connect() as conn:
        conn.execute(
            "INSERT INTO jobs(id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (job.id, json.dumps(payload, ensure_ascii=False), time.time()),
        )
        conn.commit()


def db_delete_job(job_id: str):
    with db_lock, db_connect() as conn:
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()


def postgres_schema_name(schema_name: str) -> str:
    schema_name = (schema_name or "public").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", schema_name):
        raise HTTPException(status_code=400, detail={"message": "PostgreSQL schema 名稱只能使用英文字母、數字和底線，且不能以數字開頭。"})
    return schema_name


def sqlite_export_rows() -> tuple[list[sqlite3.Row], list[sqlite3.Row]]:
    with db_lock, db_connect() as conn:
        kv_rows = conn.execute("SELECT key, value, updated_at FROM kv ORDER BY key").fetchall()
        job_rows = conn.execute("SELECT id, value, updated_at FROM jobs ORDER BY id").fetchall()
    return kv_rows, job_rows


def export_sqlite_to_postgres(settings: AppSettings) -> PostgresExportResult:
    if psycopg is None or sql is None or Jsonb is None:
        raise HTTPException(status_code=500, detail={"message": "PostgreSQL driver 尚未安裝，請安裝 psycopg[binary]。"})
    dsn = settings.postgres_dsn.strip()
    if not dsn:
        raise HTTPException(status_code=400, detail={"message": "尚未設定 PostgreSQL DSN。"})
    schema_name = postgres_schema_name(settings.postgres_schema)
    kv_rows, job_rows = sqlite_export_rows()
    try:
        with psycopg.connect(dsn, connect_timeout=10) as pg_conn:
            with pg_conn.cursor() as cur:
                schema_ident = sql.Identifier(schema_name)
                cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(schema_ident))
                cur.execute(sql.SQL("""
                    CREATE TABLE IF NOT EXISTS {}.taigi_kv (
                        key TEXT PRIMARY KEY,
                        value JSONB NOT NULL,
                        updated_at DOUBLE PRECISION NOT NULL
                    )
                """).format(schema_ident))
                cur.execute(sql.SQL("""
                    CREATE TABLE IF NOT EXISTS {}.taigi_jobs (
                        id TEXT PRIMARY KEY,
                        value JSONB NOT NULL,
                        updated_at DOUBLE PRECISION NOT NULL
                    )
                """).format(schema_ident))
                kv_insert = sql.SQL("""
                    INSERT INTO {}.taigi_kv(key, value, updated_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT(key) DO UPDATE SET
                        value = EXCLUDED.value,
                        updated_at = EXCLUDED.updated_at
                """).format(schema_ident)
                job_insert = sql.SQL("""
                    INSERT INTO {}.taigi_jobs(id, value, updated_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT(id) DO UPDATE SET
                        value = EXCLUDED.value,
                        updated_at = EXCLUDED.updated_at
                """).format(schema_ident)
                for row in kv_rows:
                    cur.execute(kv_insert, (row["key"], Jsonb(json.loads(row["value"])), row["updated_at"]))
                for row in job_rows:
                    cur.execute(job_insert, (row["id"], Jsonb(json.loads(row["value"])), row["updated_at"]))
            pg_conn.commit()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"message": f"無法匯出到 PostgreSQL：{exc}"}) from exc
    result = PostgresExportResult(
        exported=True,
        schema_name=schema_name,
        kv_rows=len(kv_rows),
        job_rows=len(job_rows),
        exported_at=time.time(),
    )
    db_set_json("postgres_last_export", result.model_dump())
    return result


def public_static_inventory() -> tuple[int, int]:
    if not PUBLIC_STATIC_DIR.exists():
        return 0, 0
    files = [path for path in PUBLIC_STATIC_DIR.rglob("*") if path.is_file()]
    return len(files), sum(path.stat().st_size for path in files)


def sync_public_static_to_object_storage(settings: AppSettings) -> StaticSyncResult:
    export_public_snapshots()
    bucket = settings.object_storage_bucket.strip()
    if not bucket:
        raise HTTPException(status_code=400, detail={"message": "請先設定 S3/R2 bucket 名稱。"})
    aws_bin = shutil.which("aws")
    if not aws_bin:
        raise HTTPException(status_code=502, detail={"message": "找不到 aws CLI。請先安裝 AWS CLI，或在伺服器 PATH 中提供 aws 指令。"})
    prefix = settings.object_storage_prefix.strip().strip("/")
    destination = f"s3://{bucket}/{prefix}" if prefix else f"s3://{bucket}"
    command = [
        aws_bin,
        "s3",
        "sync",
        str(PUBLIC_STATIC_DIR),
        destination,
        "--delete",
        "--only-show-errors",
    ]
    if settings.object_storage_endpoint_url.strip():
        command.extend(["--endpoint-url", settings.object_storage_endpoint_url.strip().rstrip("/")])
    if settings.object_storage_region.strip():
        command.extend(["--region", settings.object_storage_region.strip()])
    if settings.object_storage_profile.strip():
        command.extend(["--profile", settings.object_storage_profile.strip()])
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=60 * 10)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise HTTPException(status_code=502, detail={"message": f"同步靜態資料到 object storage 失敗：{detail}"}) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail={"message": "同步靜態資料逾時。"}) from exc
    file_count, byte_count = public_static_inventory()
    result = StaticSyncResult(
        synced=True,
        bucket=bucket,
        prefix=prefix,
        destination=destination,
        file_count=file_count,
        byte_count=byte_count,
        synced_at=time.time(),
        public_url=settings.object_storage_public_url.strip().rstrip("/"),
    )
    db_set_json("static_last_sync", result.model_dump())
    return result


app_data = {"jobs": JobStore()}


def effective_public_static_url() -> str:
    try:
        settings = load_settings()
        return (settings.object_storage_public_url.strip().rstrip("/") or PUBLIC_STATIC_URL)
    except Exception:
        return PUBLIC_STATIC_URL


def static_public_url(key: str) -> str:
    return f"{effective_public_static_url()}/{key.lstrip('/')}"


def static_write_json(key: str, payload: dict):
    path = PUBLIC_STATIC_DIR / key.lstrip("/")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def static_copy_file(source: Path, key: str) -> Optional[str]:
    if not source.exists() or not source.is_file():
        return None
    destination = PUBLIC_STATIC_DIR / key.lstrip("/")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() or destination.stat().st_mtime < source.stat().st_mtime:
        shutil.copy2(source, destination)
    return static_public_url(key)


def next_job_counter() -> int:
    global job_counter
    with job_counter_lock:
        job_counter += 1
        return job_counter


def enqueue_job(priority: int, job_id: str, payload: Optional[CreateJobRequest] = None):
    job_queue.put((priority, next_job_counter(), job_id, payload))


STATE_JSON_FILENAMES = {"segments.json", "reviews.json", "subtitles.json"}


def sync_json_file_to_db(path: Path, *, key: Optional[str] = None) -> bool:
    state_key = key or json_state_key(path)
    if db_has_json(state_key) or not path.exists():
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    db_set_json(state_key, payload)
    return True


def sync_state_files_to_db() -> dict:
    JOB_ROOT.mkdir(parents=True, exist_ok=True)
    synced = {
        "top_level": 0,
        "job_state": 0,
        "jobs": 0,
    }
    for key, path in (
        ("auth_store", AUTH_STORE),
        ("settings", SETTINGS_PATH),
        ("stats", STATS_PATH),
        ("translation_memory", TRANSLATION_MEMORY),
        ("word_db", WORD_DB),
    ):
        if sync_json_file_to_db(path, key=key):
            synced["top_level"] += 1
    for job_path in JOB_ROOT.glob("*/job.json"):
        try:
            job = Job.model_validate_json(job_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        db_save_job(job)
        synced["jobs"] += 1
    for json_path in JOB_ROOT.glob("*/output/*.json"):
        if json_path.name in STATE_JSON_FILENAMES and sync_json_file_to_db(json_path):
            synced["job_state"] += 1
    db_set_json("state_sync_last", {**synced, "synced_at": time.time()})
    return synced


TEXT_STATE_SUFFIXES = {".json", ".txt", ".srt", ".vtt"}


def cleanup_unsafe_tts_characters() -> dict:
    result = {
        "removed": 0,
        "files_changed": 0,
        "kv_rows_changed": 0,
        "job_rows_changed": 0,
        "memory_jobs_changed": 0,
        "started_at": time.time(),
        "characters": [
            {"codepoint": f"U+{ord(char):04X}", "name": name}
            for char, name in UNSAFE_TTS_CHARS.items()
        ],
    }

    if "jobs" in app_data:
        jobs: JobStore = app_data["jobs"]
        with jobs._lock:
            for job_id, job in list(jobs._jobs.items()):
                payload, count = sanitize_state_value(job.model_dump())
                if not count:
                    continue
                cleaned_job = Job.model_validate(payload)
                jobs._jobs[job_id] = cleaned_job
                jobs._persist(cleaned_job)
                result["removed"] += count
                result["memory_jobs_changed"] += 1

    for root in (JOB_ROOT,):
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_STATE_SUFFIXES:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                continue
            count = sum(text.count(char) for char in UNSAFE_TTS_CHARS)
            if not count:
                continue
            if path.suffix.lower() == ".json":
                try:
                    payload = json.loads(text)
                    cleaned_payload, count = sanitize_state_value(payload)
                    write_json_file(path, cleaned_payload)
                except Exception:
                    path.write_text(sanitize_text_for_tts(text), encoding="utf-8")
            else:
                path.write_text(sanitize_text_for_tts(text), encoding="utf-8")
            result["removed"] += count
            result["files_changed"] += 1

    with db_lock, db_connect() as conn:
        for table, key_col, value_col, result_key in (
            ("kv", "key", "value", "kv_rows_changed"),
            ("jobs", "id", "value", "job_rows_changed"),
        ):
            rows = conn.execute(f"SELECT {key_col}, {value_col} FROM {table}").fetchall()
            for row in rows:
                value = row[value_col]
                count = sum(str(value).count(char) for char in UNSAFE_TTS_CHARS)
                if not count:
                    continue
                try:
                    payload = json.loads(value)
                    cleaned_payload, count = sanitize_state_value(payload)
                    cleaned_value = json.dumps(cleaned_payload, ensure_ascii=False)
                except Exception:
                    cleaned_value = sanitize_text_for_tts(str(value))
                conn.execute(
                    f"UPDATE {table} SET {value_col} = ?, updated_at = ? WHERE {key_col} = ?",
                    (cleaned_value, time.time(), row[key_col]),
                )
                result["removed"] += count
                result[result_key] += 1
        conn.commit()

    result["completed_at"] = time.time()
    result["elapsed_seconds"] = round(result["completed_at"] - result["started_at"], 3)
    db_set_json("unsafe_tts_cleanup_last", result)
    schedule_public_snapshot_export(delay=0.1)
    return result


def enqueue_segment_regeneration_job(
    source_job: Job,
    owner_id: str,
    replacements: dict[int, dict[str, str]],
    priority: int,
) -> Job:
    now = time.time()
    indexes = sorted(replacements)
    label = f"分段 {indexes[0]}" if len(indexes) == 1 else f"{len(indexes)} 個已回饋分段"
    job_id = uuid.uuid4().hex
    taigi_text = "\n".join(replacements[index].get("taigi_text", "") for index in indexes)
    tailo_text = "\n".join(replacements[index].get("tailo_text", "") for index in indexes)
    job = Job(
        id=job_id,
        kind="segment_regeneration",
        owner_id=owner_id,
        title=f"重生{label} · {source_job.title}",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=now,
        updated_at=now,
        chinese_text=source_job.chinese_text,
        taigi_text=taigi_text,
        tailo_text=tailo_text,
        segment_count=len(indexes),
        metadata={
            "source_job_id": source_job.id,
            "segment_indexes": indexes,
            "replacements": [
                {
                    "index": index,
                    "taigi_text": replacements[index].get("taigi_text", ""),
                    "tailo_text": replacements[index].get("tailo_text", ""),
                    "synthesis_text": replacements[index].get("synthesis_text", ""),
                    "synthesis_source": replacements[index].get("synthesis_source", ""),
                }
                for index in indexes
            ],
            "requester_id": owner_id,
        },
    )
    app_data["jobs"].add(job)
    enqueue_job(priority, job_id, None)
    return job


def retry_payload_for_script_job(job: Job) -> CreateJobRequest:
    stored = job.metadata.get("create_payload") if isinstance(job.metadata, dict) else None
    if isinstance(stored, dict):
        try:
            return CreateJobRequest.model_validate(stored)
        except Exception:
            pass
    return CreateJobRequest(
        title=job.title,
        chinese_text=job.chinese_text,
        taigi_override="",
        reference_voice_mode=load_settings().default_reference_voice_mode,
        copy_to_onedrive=DEFAULT_COPY_TO_ONEDRIVE,
    )


def queue_full_script_regeneration(source_job: Job, owner_id: str, admin_or_token: bool) -> Job:
    if source_job.kind != "script":
        raise HTTPException(status_code=400, detail={"message": "只有整段稿件影片工作可以整篇重新生成。"})
    if source_job.status in {"queued", "running"}:
        raise HTTPException(status_code=409, detail={"message": "這個工作仍在排程或執行中，完成後才能整篇重新生成。"})
    payload = retry_payload_for_script_job(source_job)
    payload = payload.model_copy(update={
        "title": f"{source_job.title} 整篇重新生成",
        "copy_to_onedrive": DEFAULT_COPY_TO_ONEDRIVE if admin_or_token else False,
    })
    new_job_id = uuid.uuid4().hex
    new_job = Job(
        id=new_job_id,
        owner_id=owner_id,
        title=payload.title,
        status="queued",
        stage="Queued",
        progress=0,
        created_at=time.time(),
        updated_at=time.time(),
        chinese_text=payload.chinese_text,
        metadata={
            "create_payload": payload.model_dump(),
            "source_job_id": source_job.id,
            "regenerate_mode": "full_script",
        },
    )
    app_data["jobs"].add(new_job)
    record_stat_action("regenerate_full_job", "job", new_job_id, metadata={"source_job_id": source_job.id})
    enqueue_job(0, new_job_id, payload)
    return new_job


def segment_matches_term(segment: dict, term: str) -> bool:
    fields = (
        str(segment.get("source_text") or ""),
        str(segment.get("taigi_text") or ""),
        str(segment.get("corrected_taigi_text") or ""),
        str(segment.get("tailo_text") or ""),
    )
    return any(term in value for value in fields)


def replacement_for_term_segment(segment: dict, search_term: str, taigi_replacement: str) -> Optional[dict[str, str]]:
    current_taigi = str(segment.get("corrected_taigi_text") or segment.get("taigi_text") or "").strip()
    if not current_taigi:
        return None
    new_taigi = current_taigi.replace(search_term, taigi_replacement)
    if new_taigi == current_taigi:
        return None
    new_tailo = tailo_for(new_taigi)
    return {
        "taigi_text": new_taigi,
        "tailo_text": new_tailo,
        "synthesis_text": new_taigi,
        "synthesis_source": "taigi",
    }


def enqueue_retry_job(job: Job, priority: int) -> tuple[Job, Optional[CreateJobRequest]]:
    if job.status != "failed":
        raise HTTPException(status_code=409, detail={"message": "只有失敗的工作可以重新執行。"})
    payload: Optional[CreateJobRequest] = None
    updates = {
        "status": "queued",
        "stage": "Queued for retry",
        "progress": 0,
        "started_at": None,
        "completed_at": None,
        "elapsed_seconds": None,
        "error": None,
    }
    if job.kind == "script":
        payload = retry_payload_for_script_job(job)
        updates["metadata"] = {**job.metadata, "create_payload": payload.model_dump(), "retry_of": job.id}
    elif job.kind == "word_asset":
        word_id = str(job.metadata.get("word_id") or "")
        if not word_id:
            raise HTTPException(status_code=400, detail={"message": "這筆詞語語音工作缺少詞語資訊，無法重新執行。"})
        mark_word_generation(
            word_id,
            generation_status="queued",
            generation_stage="重新排入詞語語音佇列",
            generation_progress=0,
            generation_error="",
            generation_job_id=job.id,
            generation_synthesis_source=str(job.metadata.get("synthesis_source") or "taigi"),
            generation_updated_at=time.time(),
        )
    elif job.kind == "segment_regeneration":
        source_job_id = str(job.metadata.get("source_job_id") or "")
        if not source_job_id:
            raise HTTPException(status_code=400, detail={"message": "這筆重生分段工作缺少原始工作資訊，無法重新執行。"})
        source_job = app_data["jobs"].get(source_job_id)
        if source_job.status != "complete":
            raise HTTPException(status_code=409, detail={"message": "原始工作必須完成，才能重新執行分段重生。"})
    elif job.kind == "audio_review":
        source_job_id = str(job.metadata.get("source_job_id") or "")
        if not source_job_id:
            raise HTTPException(status_code=400, detail={"message": "這筆音訊校對工作缺少原始工作資訊，無法重新執行。"})
        source_job = app_data["jobs"].get(source_job_id)
        if source_job.status != "complete":
            raise HTTPException(status_code=409, detail={"message": "原始工作必須完成，才能重新執行音訊校對。"})
    else:
        raise HTTPException(status_code=400, detail={"message": "這種工作類型無法重新執行。"})

    updated = app_data["jobs"].update(job.id, **updates)
    enqueue_job(priority, job.id, payload)
    return updated, payload


def word_job_position(word_id: str) -> int:
    with job_queue.mutex:
        queued_items = sorted(list(job_queue.queue), key=lambda item: (item[0], item[1]))
    position = 0
    for _, _, queued_job_id, _ in queued_items:
        job = app_data["jobs"].get(queued_job_id)
        if job and job.kind == "word_asset":
            position += 1
            if job.metadata.get("word_id") == word_id:
                return position
    return 0


def word_generation_status(word: dict) -> dict:
    status = word.get("generation_status") or ("complete" if word.get("has_audio") and word.get("has_video") else "idle")
    position = word_job_position(word.get("id", "")) if status == "queued" else 0
    return {
        "generation_status": status,
        "generation_stage": word.get("generation_stage", ""),
        "generation_progress": int(word.get("generation_progress") or (100 if status == "complete" else 0)),
        "generation_error": word.get("generation_error", ""),
        "generation_position": position,
        "generation_job_id": word.get("generation_job_id", ""),
        "generation_updated_at": word.get("generation_updated_at"),
    }


def mark_word_generation(word_id: str, **patch):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        return
    word.update(patch)
    word["generation_updated_at"] = time.time()
    word["updated_at"] = time.time()
    db["words"][word_id] = word
    save_word_db(db)


def word_has_generated_asset(word: dict) -> bool:
    if word.get("has_audio") and word.get("has_video"):
        return True
    for asset in word.get("assets") or []:
        if asset.get("has_audio") and asset.get("has_video"):
            return True
    return False


def word_has_active_generation(word_id: str) -> bool:
    for job in app_data["jobs"].list():
        if job.kind != "word_asset" or job.metadata.get("word_id") != word_id:
            continue
        if job.status in {"queued", "running"}:
            return True
    return False


def enqueue_word_generation_job(
    word_id: str,
    requester_id: str = "",
    requester_name: str = "",
    *,
    auto: bool = False,
    priority: int = 5,
    synthesis_source: str = "taigi",
) -> tuple[dict, Optional[Job]]:
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    if not is_lexicon_material(str(word.get("source") or "")):
        raise HTTPException(
            status_code=400,
            detail={"message": "這段內容太長，不適合當作語詞或固定語句產生語音。請改選較短的詞語。"},
        )
    if word.get("generation_status") in {"queued", "running"} or word_has_active_generation(word_id):
        active_job_id = word.get("generation_job_id", "")
        active_job = app_data["jobs"].get(active_job_id) if active_job_id else None
        return {**word, **word_generation_status(word)}, active_job
    now = time.time()
    job_id = uuid.uuid4().hex
    requester_name = requester_name or reviewer_display_name(requester_id) or "匿名使用者"
    synthesis_source = synthesis_source if synthesis_source in {"taigi", "tailo"} else "taigi"
    word.update({
        "generation_status": "queued",
        "generation_stage": "已排入主工作佇列",
        "generation_progress": 5,
        "generation_error": "",
        "generation_job_id": job_id,
        "generation_requester_id": requester_id,
        "generation_requester_name": requester_name,
        "generation_auto": auto,
        "generation_synthesis_source": synthesis_source,
        "generation_updated_at": now,
        "updated_at": now,
    })
    db["words"][word_id] = word
    save_word_db(db)
    job = Job(
        id=job_id,
        kind="word_asset",
        owner_id=requester_id or None,
        title=f"詞語語音：{word.get('source') or word.get('taigi') or word_id}",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=now,
        updated_at=now,
        chinese_text=word.get("source", ""),
        taigi_text=word.get("taigi", ""),
        tailo_text=word.get("tailo", ""),
        segment_count=1,
        metadata={
            "word_id": word_id,
            "source": word.get("source", ""),
            "taigi": word.get("taigi", ""),
            "tailo": word.get("tailo", ""),
            "requester_id": requester_id,
            "requester_name": requester_name,
            "auto": auto,
            "synthesis_source": synthesis_source,
        },
    )
    app_data["jobs"].add(job)
    record_stat_action("create_word_asset_job", "word", word_id, metadata={"job_id": job_id, "auto": auto})
    enqueue_job(priority, job_id, None)
    return {**word, **word_generation_status(word)}, job


def reset_interrupted_word_generations():
    db = load_word_db()
    changed = False
    now = time.time()
    for word in db.get("words", {}).values():
        if word.get("generation_status") in {"queued", "running"}:
            word.update({
                "generation_status": "failed",
                "generation_stage": "服務重啟前詞語生成尚未完成",
                "generation_progress": 100,
                "generation_error": "Server stopped before this word generation finished.",
                "generation_updated_at": now,
                "updated_at": now,
            })
            changed = True
    if changed:
        save_word_db(db)


def schedule_one_missing_word_asset() -> Optional[Job]:
    db = load_word_db()
    candidates = [
        word
        for word in db.get("words", {}).values()
        if is_lexicon_material(str(word.get("source") or ""))
        and not word_has_generated_asset(word)
        and word.get("generation_status") not in {"queued", "running"}
        and not word_has_active_generation(word.get("id", ""))
    ]
    if not candidates:
        return None
    word = random.choice(candidates)
    _, job = enqueue_word_generation_job(
        word["id"],
        requester_id="system:auto-word-asset",
        requester_name="系統自動排程",
        auto=True,
        priority=20,
    )
    return job


def word_auto_scheduler():
    while True:
        time.sleep(max(60, WORD_AUTO_GENERATE_INTERVAL_SECONDS))
        try:
            schedule_one_missing_word_asset()
        except Exception as exc:
            print(f"Failed to auto-schedule word asset generation: {exc}", flush=True)


def run_word_asset_job(job_id: str):
    jobs: JobStore = app_data["jobs"]
    job = jobs.get(job_id)
    if not job:
        return
    started_at = time.time()
    word_id = str(job.metadata.get("word_id") or "")
    if not word_id:
        jobs.update(job_id, status="failed", stage="Failed", progress=100, error="Missing word_id metadata.")
        return
    mark_word_generation(
        word_id,
        generation_status="running",
        generation_stage="正在產生詞語語音",
        generation_progress=30,
        generation_error="",
    )
    jobs.update(job_id, status="running", stage="Generating word audio", progress=20, started_at=started_at)
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        jobs.update(job_id, status="failed", stage="Failed", progress=100, error="Word not found.")
        return
    try:
        settings = load_settings()
        requester_id = word.get("generation_requester_id", "")
        requester_name = word.get("generation_requester_name", "") or reviewer_display_name(requester_id)
        synthesis_source = str(job.metadata.get("synthesis_source") or word.get("generation_synthesis_source") or "taigi")
        word["generation_synthesis_source"] = synthesis_source if synthesis_source in {"taigi", "tailo"} else "taigi"
        jobs.update(job_id, stage="Synthesizing word audio", progress=45)
        generated, asset = generate_word_asset_variant(
            word,
            voice_mode=settings.default_reference_voice_mode,
            voice_control=resolve_voice_control("default_male"),
            device=DEFAULT_DEVICE,
            timesteps=8,
            cfg_value=2.5,
            generated_by_id=requester_id,
            generated_by_name=requester_name,
        )
        jobs.update(job_id, stage="Rendering word video", progress=80)
        generated.update({
            "generation_status": "complete",
            "generation_stage": "詞語語音與影片已完成",
            "generation_progress": 100,
            "generation_error": "",
            "generation_job_id": job_id,
            "generation_synthesis_source": "",
            "generation_updated_at": time.time(),
            "updated_at": time.time(),
        })
        db = load_word_db()
        db.setdefault("words", {})[word_id] = generated
        save_word_db(db)
        completed_at = time.time()
        onedrive_dir = copy_job_outputs_to_onedrive(
            job_id,
            job.title,
            WORD_ASSET_DIR / word_id / "assets" / asset["id"],
        )
        jobs.update(
            job_id,
            status="complete",
            stage="Complete",
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
            output_dir=str(WORD_ASSET_DIR / word_id / "assets" / asset["id"]),
            audio_path=asset.get("audio_path"),
            video_path=asset.get("video_path"),
            onedrive_dir=str(onedrive_dir) if onedrive_dir else None,
            taigi_text=generated.get("taigi", ""),
            tailo_text=generated.get("tailo", ""),
            metadata={**job.metadata, "asset_id": asset.get("id"), "synthesis_text": asset.get("synthesis_text"), "synthesis_source": asset.get("synthesis_source")},
        )
    except Exception as exc:
        completed_at = time.time()
        mark_word_generation(
            word_id,
            generation_status="failed",
            generation_stage="詞語語音生成失敗",
            generation_progress=100,
            generation_error=str(exc),
        )
        jobs.update(
            job_id,
            status="failed",
            stage="Failed",
            progress=100,
            error=str(exc),
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )


def run_segment_regeneration_job(job_id: str):
    jobs: JobStore = app_data["jobs"]
    job = jobs.get(job_id)
    started_at = time.time()
    try:
        source_job_id = str(job.metadata.get("source_job_id") or "")
        if not source_job_id:
            raise ValueError("Missing source_job_id metadata.")
        source_job = jobs.get(source_job_id)
        if source_job.status != "complete":
            raise ValueError("Only completed source jobs can regenerate segments.")
        segments_payload = ensure_job_segments_payload(source_job)
        if not segments_payload:
            raise FileNotFoundError("Source segments.json not found and could not be repaired.")

        replacement_rows = job.metadata.get("replacements") or []
        replacements: dict[int, dict[str, str]] = {}
        for row in replacement_rows:
            idx = int(row.get("index") or 0)
            taigi_text = str(row.get("taigi_text") or "").strip()
            tailo_text = str(row.get("tailo_text") or "").strip()
            synthesis_text = str(row.get("synthesis_text") or taigi_text or tailo_text).strip()
            if idx > 0 and synthesis_text:
                replacements[idx] = {
                    "taigi_text": taigi_text,
                    "tailo_text": tailo_text,
                    "synthesis_text": synthesis_text,
                    "synthesis_source": str(row.get("synthesis_source") or ("tailo" if synthesis_text == tailo_text else "taigi")),
                }
        if not replacements:
            raise ValueError("No segment replacements queued.")

        jobs.update(job_id, status="running", stage="Loading source segments", progress=5, started_at=started_at)

        def update_progress(stage: str, progress: int):
            jobs.update(job_id, stage=stage, progress=progress)

        regenerated, audio_path, video_path, zip_path = regenerate_job_segments_from_texts(
            source_job,
            segments_payload,
            replacements,
            progress_callback=update_progress,
        )
        taigi_text = "\n".join(str(segment.get("taigi_text") or "") for segment in segments_payload.get("segments", []))
        tailo_text = "\n".join(str(segment.get("tailo_text") or "") for segment in segments_payload.get("segments", []))
        updated_source = jobs.update(
            source_job_id,
            stage="Complete",
            progress=100,
            taigi_text=taigi_text,
            tailo_text=tailo_text,
            audio_path=str(audio_path),
            video_path=str(video_path or source_job.video_path) if (video_path or source_job.video_path) else None,
            zip_path=str(zip_path),
            error=None,
        )
        source_onedrive_dir = copy_job_outputs_to_onedrive(
            source_job_id,
            updated_source.title,
            output_dir_for_job(updated_source),
        )
        if source_onedrive_dir:
            updated_source = jobs.update(source_job_id, onedrive_dir=str(source_onedrive_dir))
        for segment in regenerated:
            record_stat_action("regenerate_segment", "segment", f"{source_job_id}:{segment.get('index')}")
        if len(regenerated) > 1:
            record_stat_action("regenerate_reviewed_segments", "job", source_job_id, metadata={"segment_count": len(regenerated), "job_id": job_id})
        schedule_public_snapshot_export()

        completed_at = time.time()
        jobs.update(
            job_id,
            status="complete",
            stage="Complete",
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
            output_dir=updated_source.output_dir,
            audio_path=updated_source.audio_path,
            video_path=updated_source.video_path,
            zip_path=updated_source.zip_path,
            onedrive_dir=updated_source.onedrive_dir,
            taigi_text=taigi_text,
            tailo_text=tailo_text,
            metadata={**job.metadata, "completed_source_job_id": source_job_id},
        )
    except Exception as exc:
        completed_at = time.time()
        jobs.update(
            job_id,
            status="failed",
            stage="Failed",
            progress=100,
            error=str(exc),
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )


def run_maintenance_job(job_id: str):
    jobs: JobStore = app_data["jobs"]
    started_at = time.time()
    try:
        jobs.update(job_id, status="running", stage="Cleaning unsafe TTS characters", progress=10, started_at=started_at)
        result = cleanup_unsafe_tts_characters()
        completed_at = time.time()
        jobs.update(
            job_id,
            status="complete",
            stage="Complete",
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
            metadata={"cleanup_result": result},
        )
    except Exception as exc:
        completed_at = time.time()
        jobs.update(
            job_id,
            status="failed",
            stage="Failed",
            progress=100,
            error=str(exc),
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )


def edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (0 if ca == cb else 1),
            ))
        previous = current
    return previous[-1]


def compare_text_similarity(reference: str, hypothesis: str) -> dict:
    ref = re.sub(r"\s+", "", sanitize_text_for_tts(reference or ""))
    hyp = re.sub(r"\s+", "", sanitize_text_for_tts(hypothesis or ""))
    if not ref:
        return {"cer": None, "similarity": None, "edit_distance": 0, "reference_length": 0}
    distance = edit_distance(ref, hyp)
    cer = round(distance / max(1, len(ref)), 4)
    return {
        "cer": cer,
        "similarity": round(max(0.0, 1.0 - cer), 4),
        "edit_distance": distance,
        "reference_length": len(ref),
    }


def model_dependency_status() -> dict:
    status = {}
    for name in ("transformers", "torch", "soundfile"):
        try:
            module = __import__(name)
            status[name] = {"available": True, "version": str(getattr(module, "__version__", ""))}
        except Exception as exc:
            status[name] = {"available": False, "error": str(exc)}
    return status


def breeze_asr_transcribe(audio_path: Path) -> tuple[str, dict]:
    if not ENABLE_BREEZE_ASR:
        return "", {"available": False, "reason": "TAIGI_WEB_ENABLE_BREEZE_ASR is not enabled", "model": BREEZE_ASR_MODEL}
    try:
        from transformers import pipeline
    except Exception as exc:
        return "", {"available": False, "reason": f"transformers unavailable: {exc}", "model": BREEZE_ASR_MODEL}
    try:
        pipe = pipeline("automatic-speech-recognition", model=BREEZE_ASR_MODEL)
        result = pipe(str(audio_path))
        if isinstance(result, dict):
            return str(result.get("text") or "").strip(), {"available": True, "model": BREEZE_ASR_MODEL}
        return str(result or "").strip(), {"available": True, "model": BREEZE_ASR_MODEL}
    except Exception as exc:
        return "", {"available": False, "reason": str(exc), "model": BREEZE_ASR_MODEL}


def mms_tts_generate(text: str, output_path: Path) -> dict:
    if not ENABLE_MMS_TTS:
        return {"available": False, "reason": "TAIGI_WEB_ENABLE_MMS_TTS is not enabled", "model": MMS_TTS_MODEL}
    try:
        from transformers import pipeline
        import soundfile as sf
    except Exception as exc:
        return {"available": False, "reason": f"TTS dependencies unavailable: {exc}", "model": MMS_TTS_MODEL}
    try:
        pipe = pipeline("text-to-speech", model=MMS_TTS_MODEL)
        result = pipe(text)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, result["audio"], result["sampling_rate"])
        return {"available": True, "model": MMS_TTS_MODEL, "audio_file": output_path.name}
    except Exception as exc:
        return {"available": False, "reason": str(exc), "model": MMS_TTS_MODEL}


def latest_audio_review_payload(job: Job) -> dict:
    output_dir = output_dir_for_job(job)
    path = output_dir / "audio_review.json"
    if state_json_exists(path):
        return load_state_json_file(path, {})
    return {}


def latest_audio_review_for_segment(job: Job, segment_index: int) -> dict:
    payload = latest_audio_review_payload(job)
    for item in payload.get("segments") or []:
        if int(item.get("index") or 0) == segment_index:
            return item
    return {}


def run_audio_review_job(job_id: str):
    jobs: JobStore = app_data["jobs"]
    job = jobs.get(job_id)
    source_job_id = str(job.metadata.get("source_job_id") or "")
    source_job = app_data["jobs"].get(source_job_id)
    started_at = time.time()
    output_dir = JOB_ROOT / job_id / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        if source_job.status != "complete":
            raise ValueError("Source job must be complete before audio review.")
        segments_payload = ensure_job_segments_payload(source_job)
        if not segments_payload:
            raise FileNotFoundError("Source segments.json not found.")
        source_output_dir = output_dir_for_job(source_job)
        run_asr = bool(job.metadata.get("run_asr", True))
        generate_mms = bool(job.metadata.get("generate_mms", False))
        provider_status = {
            "breeze_asr": {"enabled": ENABLE_BREEZE_ASR, "model": BREEZE_ASR_MODEL},
            "mms_tts": {"enabled": ENABLE_MMS_TTS, "model": MMS_TTS_MODEL},
            "dependencies": model_dependency_status(),
            "license": {
                "breeze_asr": "Apache-2.0; allowed for audio review and automated comparison with attribution.",
                "mms_tts_nan": "CC-BY-NC-4.0; non-commercial comparison only, not for commercial output.",
            },
        }
        reviewed_segments = []
        segments = sorted(segments_payload.get("segments", []), key=lambda item: int(item.get("index") or 0))
        total = max(1, len(segments))
        for position, segment in enumerate(segments, start=1):
            idx = int(segment.get("index") or position)
            jobs.update(job_id, status="running", stage=f"Reviewing audio segment {position}/{total}", progress=10 + int(position / total * 75), started_at=started_at)
            taigi_text = str(segment.get("corrected_taigi_text") or segment.get("taigi_text") or "").strip()
            tailo_text = str(segment.get("corrected_tailo_text") or segment.get("tailo_text") or "").strip()
            source_text = str(segment.get("source_text") or "").strip()
            audio_path = source_output_dir / "segments" / f"seg_{idx:02d}.wav"
            transcript = ""
            asr_status = {"available": False, "reason": "ASR not requested", "model": BREEZE_ASR_MODEL}
            if run_asr and audio_path.exists():
                transcript, asr_status = breeze_asr_transcribe(audio_path)
            comparison = compare_text_similarity(source_text, transcript) if transcript else {
                "cer": None,
                "similarity": None,
                "edit_distance": None,
                "reference_length": len(re.sub(r"\s+", "", source_text)),
            }
            issues = []
            if not audio_path.exists():
                issues.append("segment_audio_missing")
            if transcript and comparison.get("cer") is not None and comparison["cer"] > 0.35:
                issues.append("high_asr_cer")
            if not transcript:
                issues.append("asr_unavailable_or_empty")
            mms_status = {"available": False, "reason": "MMS comparison not requested", "model": MMS_TTS_MODEL}
            if generate_mms:
                mms_text = tailo_text or taigi_text
                if mms_text:
                    mms_status = mms_tts_generate(mms_text, output_dir / "mms" / f"seg_{idx:02d}.wav")
                else:
                    mms_status = {"available": False, "reason": "No Tailo or Taigi text for MMS comparison", "model": MMS_TTS_MODEL}
            reviewed_segments.append({
                "index": idx,
                "source_text": source_text,
                "expected_taigi_text": taigi_text,
                "expected_tailo_text": tailo_text,
                "reference_text": source_text,
                "asr_transcript": transcript,
                "comparison": comparison,
                "issues": issues,
                "asr_status": asr_status,
                "mms_status": mms_status,
                "reviewed_at": time.time(),
            })
        completed_at = time.time()
        scores = [item["comparison"]["similarity"] for item in reviewed_segments if item.get("comparison", {}).get("similarity") is not None]
        report = {
            "version": 1,
            "source_job_id": source_job.id,
            "review_job_id": job_id,
            "created_at": completed_at,
            "providers": provider_status,
            "summary": {
                "segment_count": len(reviewed_segments),
                "average_similarity": round(sum(scores) / len(scores), 4) if scores else None,
                "issue_count": sum(len(item.get("issues") or []) for item in reviewed_segments),
                "asr_ready": bool(ENABLE_BREEZE_ASR and provider_status["dependencies"].get("transformers", {}).get("available")),
                "mms_ready": bool(ENABLE_MMS_TTS and provider_status["dependencies"].get("transformers", {}).get("available") and provider_status["dependencies"].get("soundfile", {}).get("available")),
            },
            "segments": reviewed_segments,
        }
        save_state_json_file(output_dir / "audio_review.json", report)
        save_state_json_file(source_output_dir / "audio_review.json", report)
        onedrive_dir = copy_job_outputs_to_onedrive(job_id, job.title, output_dir)
        jobs.update(
            job_id,
            status="complete",
            stage="Complete",
            progress=100,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
            output_dir=str(output_dir),
            onedrive_dir=str(onedrive_dir) if onedrive_dir else None,
            metadata={**job.metadata, "summary": report["summary"]},
        )
        record_stat_action("audio_review_complete", "job", source_job.id, metadata=report["summary"])
    except Exception as exc:
        completed_at = time.time()
        jobs.update(
            job_id,
            status="failed",
            stage="Failed",
            progress=100,
            error=str(exc),
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )


def job_worker():
    while True:
        _, _, job_id, payload = job_queue.get()
        try:
            job = app_data["jobs"].get(job_id)
            if job and job.kind == "word_asset":
                run_word_asset_job(job_id)
            elif job and job.kind == "segment_regeneration":
                run_segment_regeneration_job(job_id)
            elif job and job.kind == "maintenance":
                run_maintenance_job(job_id)
            elif job and job.kind == "audio_review":
                run_audio_review_job(job_id)
            elif payload:
                run_job(job_id, payload)
        except Exception as exc:
            print(f"Job worker caught unhandled exception for {job_id}: {exc}", flush=True)
            traceback.print_exc()
            try:
                job = app_data["jobs"].get(job_id)
                if job and job.status in {"queued", "running"}:
                    app_data["jobs"].update(
                        job_id,
                        status="failed",
                        stage="Failed",
                        progress=100,
                        error=f"Unhandled worker error: {exc}",
                        completed_at=time.time(),
                    )
            except Exception as update_exc:
                print(f"Job worker could not mark {job_id} failed: {update_exc}", flush=True)
                traceback.print_exc()
        finally:
            job_queue.task_done()


def requeue_persisted_queued_jobs():
    for job in app_data["jobs"].list():
        if job.status != "queued":
            continue
        try:
            payload = retry_payload_for_script_job(job) if job.kind == "script" else None
            enqueue_job(10, job.id, payload)
        except Exception as exc:
            app_data["jobs"].update(
                job.id,
                status="failed",
                stage="Failed",
                progress=100,
                error=f"Could not restore queued job after restart: {exc}",
                completed_at=time.time(),
            )


def maintenance_job_exists() -> bool:
    return any(job.kind == "maintenance" and job.status in {"queued", "running"} for job in app_data["jobs"].list())


def enqueue_unsafe_tts_cleanup_job(reason: str = "scheduled") -> Job:
    if maintenance_job_exists():
        existing = next(job for job in app_data["jobs"].list() if job.kind == "maintenance" and job.status in {"queued", "running"})
        return existing
    now = time.time()
    job = Job(
        id=uuid.uuid4().hex,
        kind="maintenance",
        owner_id="system:maintenance",
        title="清理不可發音隱藏符號",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=now,
        updated_at=now,
        chinese_text="清理 U+FFFC 等不可發音隱藏符號",
        metadata={"reason": reason},
    )
    app_data["jobs"].add(job)
    enqueue_job(100, job.id, None)
    return job


def unsafe_tts_cleanup_scheduler():
    while True:
        try:
            last = db_get_json("unsafe_tts_cleanup_last", {})
            last_completed = float(last.get("completed_at") or 0) if isinstance(last, dict) else 0
            if time.time() - last_completed >= max(3600, DATA_CLEANUP_INTERVAL_SECONDS):
                enqueue_unsafe_tts_cleanup_job("scheduled")
        except Exception as exc:
            print(f"Unsafe TTS cleanup scheduler failed: {exc}", flush=True)
        time.sleep(max(300, min(DATA_CLEANUP_INTERVAL_SECONDS, 3600)))


def job_watchdog():
    while True:
        time.sleep(max(15, JOB_WATCHDOG_INTERVAL_SECONDS))
        try:
            now = time.time()
            for job in app_data["jobs"].list():
                if job.status != "running":
                    continue
                if now - float(job.updated_at or job.started_at or now) < RUNNING_JOB_STALE_SECONDS:
                    continue
                app_data["jobs"].update(
                    job.id,
                    status="failed",
                    stage="Failed",
                    progress=100,
                    error=f"Job watchdog marked this job failed after {RUNNING_JOB_STALE_SECONDS}s without progress.",
                    completed_at=now,
                    elapsed_seconds=round(now - float(job.started_at or job.created_at or now), 3),
                )
                if job.kind == "word_asset":
                    word_id = str(job.metadata.get("word_id") or "")
                    if word_id:
                        mark_word_generation(
                            word_id,
                            generation_status="failed",
                            generation_stage="詞語語音生成逾時",
                            generation_progress=100,
                            generation_error="Job watchdog marked this word asset job failed.",
                        )
        except Exception as exc:
            print(f"Job watchdog failed: {exc}", flush=True)


worker_thread = Thread(target=job_worker, daemon=True)
word_auto_scheduler_thread = Thread(target=word_auto_scheduler, daemon=True)
job_watchdog_thread = Thread(target=job_watchdog, daemon=True)
unsafe_tts_cleanup_scheduler_thread = Thread(target=unsafe_tts_cleanup_scheduler, daemon=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    JOB_ROOT.mkdir(parents=True, exist_ok=True)
    sync_state_files_to_db()
    app_data["jobs"].load()
    requeue_persisted_queued_jobs()
    load_auth_store()
    load_settings()
    load_stats()
    load_translation_memory()
    load_word_db()
    reset_interrupted_word_generations()
    schedule_public_snapshot_export(delay=0.1)
    if not worker_thread.is_alive():
        worker_thread.start()
    if not word_auto_scheduler_thread.is_alive():
        word_auto_scheduler_thread.start()
    if not job_watchdog_thread.is_alive():
        job_watchdog_thread.start()
    if not unsafe_tts_cleanup_scheduler_thread.is_alive():
        unsafe_tts_cleanup_scheduler_thread.start()
    yield


app = FastAPI(title="Taigi Voice Video Web", lifespan=lifespan)

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
PUBLIC_STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static-data", StaticFiles(directory=PUBLIC_STATIC_DIR), name="static-data")


def web_token() -> Optional[str]:
    return os.environ.get("TAIGI_WEB_TOKEN")


def hash_secret(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def load_auth_store() -> dict:
    with auth_lock:
        payload = load_json_state(
            AUTH_STORE,
            {"magic_tokens": {}, "sessions": {}, "users": {}, "anonymous_users": {}},
            key="auth_store",
            create=True,
        )
        payload.setdefault("magic_tokens", {})
        payload.setdefault("sessions", {})
        payload.setdefault("users", {})
        payload.setdefault("anonymous_users", {})
        return payload


def load_settings() -> AppSettings:
    default = AppSettings()
    payload = load_json_state(SETTINGS_PATH, default.model_dump(), key="settings", create=True)
    try:
        settings = AppSettings.model_validate(payload)
    except Exception:
        settings = default
    save_json_state(SETTINGS_PATH, settings.model_dump(), key="settings")
    return settings


RANDOM_SENTENCE_FALLBACKS = [
    "今天下午想聽一段輕鬆的生活新聞，內容可以聊人工智慧、台灣科技，還有週末適合做的事情。",
    "早安，今天想用台語聽一則短短的重點整理，主題是半導體產業、AI 工具，以及一般人可以怎麼應用。",
    "午安啊，今天在家裡想練習一句台語，先從簡單的日常問候開始，再慢慢學會介紹自己的生活。",
    "我想做一支給自己聽的台語語音影片，內容介紹今天最值得注意的科技新聞和生活小提醒。",
    "晚上散步的時候，我想聽一段台語短文，講一講珍珠奶茶、夜市小吃，以及台灣日常生活的趣味。",
]


def clean_generated_sentence(text: str) -> str:
    text = sanitize_text_for_tts(text)
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"^[「\"']|[」\"']$", "", text.strip())
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^(中文稿|句子|範例|輸出)[:：]\s*", "", text)
    if not re.search(r"[。！？!?]$", text):
        text += "。"
    return text[:220]


def fallback_random_sentence(payload: RandomSentenceRequest) -> str:
    topic = payload.topic.strip()
    if topic:
        templates = [
            f"今天想聽一段關於{topic}的台語語音影片，內容要自然、簡短，適合用來練習聽台語。",
            f"早安，今天的主題是{topic}，請用輕鬆的方式整理一小段重點，讓我可以轉成台語語音來聽。",
            f"我想用台語聽一段{topic}的介紹，內容不用太長，但是要有生活感，也適合做成字幕影片。",
        ]
        return random.choice(templates)
    return random.choice(RANDOM_SENTENCE_FALLBACKS)


def generate_random_sentence(payload: RandomSentenceRequest) -> RandomSentenceResponse:
    settings = load_settings()
    if not settings.llm_api_key or not settings.llm_api_base_url or not settings.llm_model:
        text = fallback_random_sentence(payload)
        return RandomSentenceResponse(title=title_from_text(text), chinese_text=text, source="fallback")

    topic = payload.topic.strip() or "台灣日常生活、科技新聞、學習台語"
    length_hint = "一句到兩句，總長 40 到 70 個中文字" if payload.length == "short" else "兩到三句，總長 80 到 130 個中文字"
    body = {
        "model": settings.llm_model,
        "messages": [
            {
                "role": "system",
                "content": "你是協助產生台語語音影片中文稿的編輯。只輸出繁體中文句子，不要解釋，不要條列，不要加標題。",
            },
            {
                "role": "user",
                "content": f"請生成適合轉成台語語音影片的中文稿。主題：{topic}。風格：自然、口語、台灣用語。長度：{length_hint}。",
            },
        ],
        "temperature": 0.9,
        "max_tokens": 220,
    }
    base = settings.llm_api_base_url.rstrip("/")
    url = f"{base}/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.llm_api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = json.loads(res.read().decode("utf-8"))
        text = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
        text = clean_generated_sentence(text)
        if not text:
            raise ValueError("LLM did not return text.")
        return RandomSentenceResponse(title=title_from_text(text), chinese_text=text, source="llm", model=settings.llm_model)
    except Exception as exc:
        print(f"LLM random sentence failed: {exc}", flush=True)
        text = fallback_random_sentence(payload)
        return RandomSentenceResponse(title=title_from_text(text), chinese_text=text, source="fallback", model=settings.llm_model)


def save_settings(settings: AppSettings):
    save_json_state(SETTINGS_PATH, settings.model_dump(), key="settings")


def save_auth_store(payload: dict):
    with auth_lock:
        save_json_state(AUTH_STORE, payload, key="auth_store")


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


def create_session(email: str) -> str:
    token = secrets.token_urlsafe(32)
    payload = load_auth_store()
    prune_auth_store(payload)
    payload.setdefault("users", {}).setdefault(email, {"email": email, "created_at": time.time()})
    payload["users"][email]["last_login_at"] = time.time()
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
    return email


def session_email(token: str) -> Optional[str]:
    payload = load_auth_store()
    prune_auth_store(payload)
    entry = payload.get("sessions", {}).get(hash_secret(token.strip()))
    if not entry:
        return None
    email = entry.get("email", "").strip().lower()
    return email


def revoke_session(token: Optional[str]):
    if not token:
        return
    payload = load_auth_store()
    payload.get("sessions", {}).pop(hash_secret(token.strip()), None)
    save_auth_store(payload)


def anon_token_from_user_id(user_id: str) -> str:
    return user_id.split(":", 1)[1] if user_id.startswith("anon:") else ""


def default_anon_base_nickname(token: str) -> str:
    digest = sha256(token.encode("utf-8")).hexdigest()
    return ANON_TAIGI_NICKNAMES[int(digest[:8], 16) % len(ANON_TAIGI_NICKNAMES)]


def anonymous_suffix(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()[:4]


def ensure_anonymous_profile(user_id: str) -> dict:
    token = anon_token_from_user_id(user_id)
    if not token:
        return {}
    payload = load_auth_store()
    anonymous_users = payload.setdefault("anonymous_users", {})
    now = time.time()
    profile = anonymous_users.get(token)
    if not profile:
        base = default_anon_base_nickname(token)
        profile = {
            "id": token,
            "nickname": base,
            "display_name": f"{base}-{anonymous_suffix(token)}",
            "created_at": now,
            "updated_at": now,
            "nickname_change_count": 0,
            "nickname_history": [],
        }
        anonymous_users[token] = profile
        save_auth_store(payload)
    return profile


def set_anonymous_nickname(user_id: str, nickname: str) -> dict:
    token = anon_token_from_user_id(user_id)
    if not token:
        raise HTTPException(status_code=400, detail={"message": "只有匿名使用者可以設定匿名暱稱。"})
    nickname = nickname.strip()
    if nickname not in ANON_TAIGI_NICKNAMES:
        raise HTTPException(status_code=400, detail={"message": "請從系統提供的台語匿名暱稱中選擇。"})
    payload = load_auth_store()
    anonymous_users = payload.setdefault("anonymous_users", {})
    current = anonymous_users.get(token) or ensure_anonymous_profile(user_id)
    now = time.time()
    old_nickname = current.get("nickname") or default_anon_base_nickname(token)
    if old_nickname != nickname:
        current.setdefault("nickname_history", []).append({
            "from": old_nickname,
            "to": nickname,
            "changed_at": now,
        })
        current["nickname_change_count"] = int(current.get("nickname_change_count") or 0) + 1
    current["nickname"] = nickname
    current["display_name"] = f"{nickname}-{anonymous_suffix(token)}"
    current["updated_at"] = now
    anonymous_users[token] = current
    save_auth_store(payload)
    record_stat_action("anonymous_nickname_change", "anonymous_user", token)
    return current


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


def public_rate_limit_state(request: Request) -> dict:
    limit_seconds = max(60, int(load_settings().public_rate_limit_seconds))
    ip = client_ip(request) or "unknown"
    now = time.time()
    with rate_limit_lock:
        last = rate_limit_seen.get(ip, 0)
    remaining = max(0, limit_seconds - (now - last))
    return {
        "limit_seconds": limit_seconds,
        "wait_seconds": int(remaining),
        "can_submit": remaining <= 0,
        "next_available_at": last + limit_seconds if remaining > 0 else now,
        "sentence_limit": None,
        "max_chars": PUBLIC_ANONYMOUS_MAX_CHARS,
    }


def queue_status() -> dict:
    jobs = app_data["jobs"].list()
    running_count = sum(1 for job in jobs if job.status == "running")
    with job_queue.mutex:
        queued_count = len(job_queue.queue)
    return {
        "running_count": running_count,
        "queued_count": queued_count,
        "next_position": running_count + queued_count + 1,
    }


def enforce_public_rate_limit(request: Request, text: str):
    if is_private_client(request):
        return
    rate_state = public_rate_limit_state(request)
    text_length = len(sanitize_text_for_tts(text).strip())
    if text_length > PUBLIC_ANONYMOUS_MAX_CHARS:
        raise HTTPException(
            status_code=429,
            detail={
                "message": f"未登入使用者每次最多可以送出 {PUBLIC_ANONYMOUS_MAX_CHARS} 個字。",
                "rate_limit": rate_state,
                "queue": queue_status(),
            },
        )
    ip = client_ip(request) or "unknown"
    now = time.time()
    with rate_limit_lock:
        last = rate_limit_seen.get(ip, 0)
        remaining = rate_state["limit_seconds"] - (now - last)
        if remaining > 0:
            retry_state = {
                **rate_state,
                "wait_seconds": int(remaining),
                "can_submit": False,
                "next_available_at": last + rate_state["limit_seconds"],
            }
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "未登入使用者需要等待後才能再次生成語音。",
                    "rate_limit": retry_state,
                    "queue": queue_status(),
                },
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


def bearer_token_from_request(request: Request, authorization: Optional[str] = None) -> str:
    header = authorization or request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


def session_token_email(request: Request, authorization: Optional[str] = None) -> Optional[str]:
    bearer = bearer_token_from_request(request, authorization)
    return session_email(bearer) if bearer else None


def is_authorized(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
) -> bool:
    admin_session = request.cookies.get(ADMIN_SESSION_COOKIE)
    if admin_session and session_email(admin_session) == ADMIN_EMAIL:
        return True
    if session_token_email(request, authorization) == ADMIN_EMAIL:
        return True
    token = web_token()
    if token:
        bearer = bearer_token_from_request(request, authorization)
        return taigi_web_token_cookie == token or bearer == token
    settings_token = load_settings().api_access_token.strip()
    if settings_token and authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
        return secrets.compare_digest(bearer, settings_token)
    return not PUBLIC_ACCESS and is_loopback(request)


def authenticated_email(request: Request) -> Optional[str]:
    session = request.cookies.get(ADMIN_SESSION_COOKIE)
    cookie_email = session_email(session) if session else None
    return cookie_email or session_token_email(request)


def is_authenticated(request: Request) -> bool:
    return bool(authenticated_email(request))


def require_email_login(request: Request) -> str:
    email = authenticated_email(request)
    if not email:
        raise HTTPException(status_code=401, detail={"message": "這項申請需要先用 email 登入。"})
    return email


def require_auth(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if not is_authorized(request, taigi_web_token_cookie, authorization):
        raise HTTPException(status_code=401, detail="Private access required")


def job_is_public(job: Job) -> bool:
    return job.status == "complete" or job.kind == "word_asset"


def job_is_owned_by_request(job: Job, request: Request) -> bool:
    email = authenticated_email(request)
    if email and job.owner_id == f"user:{email}":
        return True
    existing = request.cookies.get(REVIEWER_COOKIE)
    return bool(existing and job.owner_id == f"anon:{existing}")


def reviews_path_for_job(job: Job) -> Path:
    output_dir = Path(job.output_dir or JOB_ROOT / job.id / "output")
    return output_dir / "reviews.json"


def load_state_json_file(path: Path, default: dict) -> dict:
    return load_json_state(path, default)


def save_state_json_file(path: Path, payload: dict):
    save_json_state(path, payload)


def state_json_exists(path: Path) -> bool:
    return path.exists() or db_has_json(json_state_key(path))


def load_reviews(job: Job) -> list[dict]:
    reviews_path = reviews_path_for_job(job)
    return load_json_state(reviews_path, {"reviews": []}).get("reviews", [])


def save_reviews(job: Job, reviews: list[dict]):
    reviews_path = reviews_path_for_job(job)
    save_json_state(reviews_path, {"reviews": reviews})


def load_stats() -> dict:
    with stats_lock:
        default = {
            "total_plays": 0,
            "audio_plays": 0,
            "video_plays": 0,
            "jobs": {},
            "words": {},
            "actions": {},
            "daily": {},
            "updated_at": 0,
        }
        payload = load_json_state(STATS_PATH, default, key="stats", create=True)
        payload.setdefault("jobs", {})
        payload.setdefault("words", {})
        payload.setdefault("actions", {})
        payload.setdefault("daily", {})
        payload.setdefault("total_plays", 0)
        payload.setdefault("audio_plays", 0)
        payload.setdefault("video_plays", 0)
        return payload


def save_stats(payload: dict):
    with stats_lock:
        payload["updated_at"] = time.time()
        save_json_state(STATS_PATH, payload, key="stats")


def stats_day_key(ts: Optional[float] = None) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(ts or time.time()))


def record_stat_action(action: str, target_type: str = "", target_id: str = "", amount: int = 1, metadata: Optional[dict] = None):
    action = re.sub(r"[^a-z0-9_.:-]+", "_", action.strip().lower())[:64]
    if not action:
        return
    stats = load_stats()
    amount = max(1, int(amount))
    stats.setdefault("actions", {})[action] = int(stats.setdefault("actions", {}).get(action) or 0) + amount
    day = stats.setdefault("daily", {}).setdefault(stats_day_key(), {"actions": {}, "targets": {}, "total": 0})
    day["total"] = int(day.get("total") or 0) + amount
    day.setdefault("actions", {})[action] = int(day.setdefault("actions", {}).get(action) or 0) + amount
    if target_type and target_id:
        target_key = f"{target_type}:{target_id}"
        target = day.setdefault("targets", {}).setdefault(target_key, {"count": 0, "actions": {}})
        target["count"] = int(target.get("count") or 0) + amount
        target.setdefault("actions", {})[action] = int(target.setdefault("actions", {}).get(action) or 0) + amount
    stats["last_action"] = {
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "metadata": metadata or {},
        "created_at": time.time(),
    }
    save_stats(stats)


def load_source_export_requests() -> dict:
    payload = db_get_json("source_export_requests", None)
    if not isinstance(payload, dict):
        payload = {"requests": [], "by_email": {}, "updated_at": 0}
        db_set_json("source_export_requests", payload)
    payload.setdefault("requests", [])
    payload.setdefault("by_email", {})
    payload.setdefault("updated_at", 0)
    return payload


def save_source_export_requests(payload: dict):
    payload["updated_at"] = time.time()
    db_set_json("source_export_requests", payload)


def source_export_summary() -> dict:
    payload = load_source_export_requests()
    requests = payload.get("requests", [])
    by_email = payload.get("by_email", {})
    return {
        "total_requests": len(requests),
        "requester_count": len(by_email),
        "latest_requested_at": max((float(item.get("requested_at") or 0) for item in requests), default=0),
    }


def record_source_export_request(email: str, payload: SourceExportRequest) -> dict:
    email = email.strip().lower()
    now = time.time()
    requested = [lang for lang in payload.languages if lang in SUPPORTED_CORPUS_LANGUAGES] or SUPPORTED_CORPUS_LANGUAGES
    store = load_source_export_requests()
    entry = {
        "id": uuid.uuid4().hex,
        "email": email,
        "languages": requested,
        "format": payload.format,
        "note": payload.note.strip(),
        "requested_at": now,
    }
    store.setdefault("requests", []).append(entry)
    requester = store.setdefault("by_email", {}).setdefault(email, {
        "email": email,
        "count": 0,
        "first_requested_at": now,
        "last_requested_at": now,
        "requested_at": [],
    })
    requester["count"] = int(requester.get("count") or 0) + 1
    requester["first_requested_at"] = float(requester.get("first_requested_at") or now)
    requester["last_requested_at"] = now
    requester.setdefault("requested_at", []).append(now)
    save_source_export_requests(store)
    record_stat_action(
        "request_source_export",
        "source_export",
        email,
        metadata={"languages": requested, "format": payload.format},
    )
    summary = source_export_summary()
    return {
        "saved": True,
        "request": entry,
        "requester_count": requester["count"],
        "total_requests": summary["total_requests"],
        "unique_requesters": summary["requester_count"],
    }


def increment_play(kind: Literal["audio", "video"], target_type: Literal["job", "segment", "word"], target_id: str, job_id: str = ""):
    stats = load_stats()
    stats["total_plays"] = int(stats.get("total_plays") or 0) + 1
    key = "audio_plays" if kind == "audio" else "video_plays"
    stats[key] = int(stats.get(key) or 0) + 1
    group_key = "words" if target_type == "word" else "jobs"
    group_id = target_id if target_type == "word" else (job_id or target_id)
    group = stats.setdefault(group_key, {}).setdefault(group_id, {"audio_plays": 0, "video_plays": 0, "plays": 0})
    group["plays"] = int(group.get("plays") or 0) + 1
    group[key] = int(group.get(key) or 0) + 1
    group["updated_at"] = time.time()
    if target_type == "segment":
        segment = group.setdefault("segments", {}).setdefault(target_id, {"audio_plays": 0, "plays": 0})
        segment["plays"] = int(segment.get("plays") or 0) + 1
        segment["audio_plays"] = int(segment.get("audio_plays") or 0) + 1
        segment["updated_at"] = time.time()
    if target_type == "word" and job_id:
        asset = group.setdefault("assets", {}).setdefault(job_id, {"audio_plays": 0, "video_plays": 0, "plays": 0})
        asset["plays"] = int(asset.get("plays") or 0) + 1
        asset[key] = int(asset.get(key) or 0) + 1
        asset["updated_at"] = time.time()
    save_stats(stats)
    record_stat_action(f"play_{kind}", target_type, f"{target_id}:{job_id}" if target_type == "word" and job_id else target_id if target_type != "segment" else f"{job_id}:{target_id}")
    schedule_public_snapshot_export()


def job_play_summary(job_id: str) -> dict:
    group = load_stats().get("jobs", {}).get(job_id, {})
    return {
        "play_count": int(group.get("plays") or 0),
        "audio_play_count": int(group.get("audio_plays") or 0),
        "video_play_count": int(group.get("video_plays") or 0),
    }


def review_user_id(request: Request, response: Optional[Response] = None) -> str:
    email = authenticated_email(request)
    if email:
        return f"admin:{email}" if email == ADMIN_EMAIL else f"user:{email}"
    existing = request.cookies.get(REVIEWER_COOKIE)
    if existing and re.fullmatch(r"[a-f0-9]{32}", existing):
        user_id = f"anon:{existing}"
        ensure_anonymous_profile(user_id)
        return user_id
    reviewer_id = secrets.token_hex(16)
    if response is not None:
        response.set_cookie(
            REVIEWER_COOKIE,
            reviewer_id,
            max_age=SESSION_TTL_SECONDS,
            httponly=True,
            secure=request.headers.get("x-forwarded-proto", request.url.scheme) == "https",
            samesite="lax",
        )
    user_id = f"anon:{reviewer_id}"
    ensure_anonymous_profile(user_id)
    return user_id


def reviewer_display_name(user_id: str) -> str:
    if user_id.startswith("admin:"):
        return "管理員"
    if user_id.startswith("user:"):
        return user_id.split(":", 1)[1]
    token = user_id.split(":", 1)[1] if ":" in user_id else user_id
    profile = ensure_anonymous_profile(f"anon:{token}")
    return profile.get("display_name") or f"{default_anon_base_nickname(token)}-{anonymous_suffix(token)}"


def segment_review_stats(reviews: list[dict], segment_index: int, user_id: Optional[str] = None) -> dict:
    segment_reviews = [review for review in reviews if review.get("segment_index") == segment_index]
    ratings = [int(review.get("rating") or 0) for review in segment_reviews if int(review.get("rating") or 0) > 0]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    my_review = next((review for review in segment_reviews if user_id and review.get("user_id") == user_id), None)
    return {
        "average_rating": average,
        "rating_count": len(ratings),
        "my_rating": my_review.get("rating") if my_review else None,
        "my_note": my_review.get("note", "") if my_review else "",
    }


def job_rating_summary(job: Job, user_id: str = "") -> dict:
    reviews = load_reviews(job)
    job_reviews = [
        review for review in reviews
        if review.get("target") == "job" or review.get("segment_index") == 0
    ]
    rating_source = job_reviews or reviews
    ratings = [int(review.get("rating") or 0) for review in rating_source if int(review.get("rating") or 0) > 0]
    my_review = next((review for review in job_reviews if user_id and review.get("user_id") == user_id), None)
    return {
        "rating_average": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "rating_count": len(ratings),
        "my_rating": my_review.get("rating") if my_review else None,
        "my_note": my_review.get("note", "") if my_review else "",
    }


def job_sort_score(job: Job) -> tuple:
    rating = job_rating_summary(job)["rating_average"] or 0
    plays = job_play_summary(job.id)["play_count"]
    return (1 if job.featured_at else 0, job.featured_at or 0, rating, plays, job.updated_at)


def present_job(job: Job, admin: bool, user_id: str = ""):
    if admin:
        payload = job.model_dump()
    else:
        payload = job.model_dump()
        for key in ("owner_id", "output_dir", "audio_path", "zip_path", "onedrive_dir"):
            payload.pop(key, None)
        payload["audio_path"] = "available" if job.audio_path else None
        payload["video_path"] = "available" if job.video_path else None
        if isinstance(payload.get("metadata"), dict):
            payload["metadata"] = {
                key: value
                for key, value in payload["metadata"].items()
                if key not in {"requester_id", "replacements"}
            }
    payload.update(job_rating_summary(job, user_id))
    payload.update(job_play_summary(job.id))
    return payload


def require_job_access(
    job: Job,
    request: Request,
    taigi_web_token_cookie: Optional[str] = None,
    authorization: Optional[str] = None,
):
    if job_is_public(job) or is_authorized(request, taigi_web_token_cookie, authorization) or job_is_owned_by_request(job, request):
        return
    raise HTTPException(status_code=401, detail="Private access required")


def source_job_for_segment_regeneration(job: Job) -> Job:
    if job.kind != "segment_regeneration":
        return job
    source_job_id = str(job.metadata.get("source_job_id") or "")
    if not source_job_id:
        raise HTTPException(status_code=400, detail={"message": "這筆重生工作缺少原始工作資訊。"})
    return app_data["jobs"].get(source_job_id)


def output_dir_for_job(job: Job) -> Path:
    return Path(job.output_dir or JOB_ROOT / job.id / "output")


def static_segments_path_for_job(job: Job) -> Path:
    return PUBLIC_STATIC_DIR / "public" / "media" / "jobs" / job.id / "segments.json"


def split_stored_lines(text: str, fallback_max_chars: int = 90) -> list[str]:
    text = sanitize_text_for_tts(text or "").strip()
    if not text:
        return []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) > 1:
        return lines
    return split_segments(text, fallback_max_chars)


def build_recovered_segments_from_job(job: Job) -> list[dict]:
    payload = job.metadata.get("create_payload") if isinstance(job.metadata, dict) else {}
    max_chars = 90
    if isinstance(payload, dict):
        try:
            max_chars = int(payload.get("max_chars_per_segment") or max_chars)
        except Exception:
            max_chars = 90
    source_segments = split_stored_lines(job.chinese_text, max_chars)
    taigi_segments = split_stored_lines(job.taigi_text, max_chars)
    tailo_segments = split_stored_lines(job.tailo_text, max_chars)
    total = max(len(source_segments), len(taigi_segments), len(tailo_segments), int(job.segment_count or 0))
    segments = []
    for idx in range(total):
        taigi_text = taigi_segments[idx] if idx < len(taigi_segments) else ""
        tailo_text = tailo_segments[idx] if idx < len(tailo_segments) else ""
        if taigi_text and not tailo_text:
            tailo_text = tailo_for(taigi_text)
        segments.append({
            "index": idx + 1,
            "source_text": source_segments[idx] if idx < len(source_segments) else "",
            "taigi_text": taigi_text,
            "tailo_text": tailo_text,
            "audio_file": f"segments/seg_{idx + 1:02d}.wav",
            "rating": None,
            "feedback_count": 0,
            "recovered": True,
            "recovered_at": time.time(),
        })
    return segments


def ensure_job_segments_payload(job: Job, *, repair: bool = True) -> Optional[dict]:
    output_dir = output_dir_for_job(job)
    segments_path = output_dir / "segments.json"
    if state_json_exists(segments_path):
        payload = load_state_json_file(segments_path, {"segments": []})
        if payload.get("segments"):
            return payload
    if not repair:
        return None

    static_path = static_segments_path_for_job(job)
    if static_path.exists():
        try:
            payload = json.loads(static_path.read_text(encoding="utf-8"))
        except Exception:
            payload = {"segments": []}
        if payload.get("segments"):
            save_state_json_file(segments_path, payload)
            return payload

    segments = build_recovered_segments_from_job(job)
    if segments:
        payload = {"segments": segments, "recovered": True, "recovered_at": time.time()}
        save_state_json_file(segments_path, payload)
        app_data["jobs"].update(
            job.id,
            segment_count=len(segments),
            stage=job.stage,
            progress=job.progress,
        )
        record_stat_action("repair_segments", "job", job.id, metadata={"segment_count": len(segments)})
        return payload
    return None


def content_disposition(filename: str) -> str:
    encoded = quote(filename, safe="")
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-") or "download"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def clean_download_name(value: str, fallback: str = "download", limit: int = 90) -> str:
    value = sanitize_text_for_tts(value or "")
    value = re.sub(r"[\r\n\t]+", " ", value)
    value = re.sub(r"[\\/:*?\"<>|]+", "-", value)
    value = re.sub(r"\s+", " ", value).strip(" .-_")
    if not value:
        value = fallback
    return value[:limit].strip(" .-_") or fallback


def download_filename(base: str, suffix: str, fallback: str = "download") -> str:
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    return f"{clean_download_name(base, fallback=fallback)}{suffix}"


def job_download_base(job: Job, kind: str) -> str:
    if job.kind == "word_asset" and (job.tailo_text or job.taigi_text):
        return job.tailo_text or tailo_for(job.taigi_text) or job.taigi_text
    first_sentence = title_from_text(job.chinese_text or job.title, limit=72)
    if kind in {"audio", "video", "zip"}:
        return first_sentence
    if kind == "tailo":
        return title_from_text(job.tailo_text or first_sentence, limit=72)
    if kind == "taigi":
        return title_from_text(job.taigi_text or first_sentence, limit=72)
    return first_sentence


def job_download_filename(job: Job, kind: str, path: Path) -> str:
    suffix = path.suffix or {
        "zip": ".zip",
        "audio": ".wav",
        "video": ".mp4",
        "taigi": ".txt",
        "tailo": ".txt",
        "subtitles": ".json",
        "segments": ".json",
    }.get(kind, ".dat")
    label = {
        "zip": "",
        "audio": "音訊",
        "video": "影片",
        "taigi": "台語稿",
        "tailo": "台羅",
        "subtitles": "字幕",
        "segments": "分段",
    }.get(kind, kind)
    base = job_download_base(job, kind)
    return download_filename(f"{base}-{label}" if label else base, suffix, fallback=f"job-{job.id}-{kind}")


def segment_download_filename(job: Job, segment_index: int, output_dir: Path, path: Path) -> str:
    segment = {}
    segments_path = output_dir / "segments.json"
    if state_json_exists(segments_path):
        payload = load_state_json_file(segments_path, {"segments": []})
        segment = next(
            (item for item in payload.get("segments", []) if int(item.get("index") or 0) == segment_index),
            {},
        )
    taigi_text = str(segment.get("taigi_text") or "").strip()
    base = (
        str(segment.get("tailo_text") or "").strip()
        or (tailo_for(taigi_text) if taigi_text else "")
        or str(segment.get("source_text") or "").strip()
        or f"{job.title} segment {segment_index}"
    )
    return download_filename(f"{base}-seg-{segment_index:02d}", path.suffix or ".wav", fallback=f"{job.id}-seg-{segment_index:02d}")


def word_download_filename(word: dict, kind: str, path: Path) -> str:
    taigi_text = str(word.get("taigi") or "").strip()
    base = str(word.get("tailo") or "").strip() or (tailo_for(taigi_text) if taigi_text else "") or str(word.get("source") or "").strip()
    label = "音訊" if kind == "audio" else "影片"
    return download_filename(f"{base}-{label}", path.suffix or (".wav" if kind == "audio" else ".mp4"), fallback=f"{word.get('id') or 'word'}-{kind}")


def file_inventory() -> dict:
    job_audio_files = list(JOB_ROOT.glob("*/output/**/*.wav"))
    job_video_files = list(JOB_ROOT.glob("*/output/**/*.mp4"))
    word_audio_files = list(WORD_ASSET_DIR.glob("*/word.wav")) if WORD_ASSET_DIR.exists() else []
    word_video_files = list(WORD_ASSET_DIR.glob("*/word.mp4")) if WORD_ASSET_DIR.exists() else []
    return {
        "audio_files": len(job_audio_files) + len(word_audio_files),
        "video_files": len(job_video_files) + len(word_video_files),
        "job_audio_files": len(job_audio_files),
        "job_video_files": len(job_video_files),
        "word_audio_files": len(word_audio_files),
        "word_video_files": len(word_video_files),
    }


def public_media_for_job(job: Job) -> dict:
    media: dict[str, str] = {}
    if job.status != "complete":
        return media
    for kind, source in {
        "audio": Path(job.audio_path or ""),
        "video": Path(job.video_path or ""),
        "zip": Path(job.zip_path or ""),
    }.items():
        suffix = source.suffix or (".wav" if kind == "audio" else ".mp4" if kind == "video" else ".zip")
        url = static_copy_file(source, f"public/media/jobs/{job.id}/{kind}{suffix}")
        if url:
            media[kind] = url
    output_dir = Path(job.output_dir or "")
    for name, media_key in {
        "taigi_draft.txt": "taigi",
        "tailo.txt": "tailo",
        "subtitles.json": "subtitles",
        "segments.json": "segments",
    }.items():
        url = static_copy_file(output_dir / name, f"public/media/jobs/{job.id}/{name}")
        if url:
            media[media_key] = url
    segments_dir = output_dir / "segments"
    if segments_dir.exists():
        for segment_audio in sorted(segments_dir.glob("seg_*.wav")):
            static_copy_file(segment_audio, f"public/media/jobs/{job.id}/segments/{segment_audio.name}")
    return media


def public_media_for_word(word: dict) -> dict:
    media: dict[str, str] = {}
    for kind, source in {
        "audio": Path(word.get("audio_path") or ""),
        "video": Path(word.get("video_path") or ""),
    }.items():
        suffix = source.suffix or (".wav" if kind == "audio" else ".mp4")
        url = static_copy_file(source, f"public/media/words/{word.get('id')}/legacy/{kind}{suffix}")
        if url:
            media[kind] = url
    asset_media = {}
    for asset in word.get("assets", []) or []:
        asset_id = asset.get("id") or "asset"
        urls = {}
        for kind, source in {
            "audio": Path(asset.get("audio_path") or ""),
            "video": Path(asset.get("video_path") or ""),
        }.items():
            suffix = source.suffix or (".wav" if kind == "audio" else ".mp4")
            url = static_copy_file(source, f"public/media/words/{word.get('id')}/{asset_id}/{kind}{suffix}")
            if url:
                urls[kind] = url
        if urls:
            asset_media[asset_id] = urls
    if asset_media:
        media["assets"] = asset_media
    return media


def public_word_entry(word: dict, stats_words: dict, user_id: str = "") -> dict:
    ratings = word_rating_summary(word, user_id)
    generation = word_generation_status(word)
    token_summary = word_token_review_summary(word)
    word_db = load_word_db()
    token_statuses = word_token_review_statuses(word, user_id)
    source_tokens = segment_token_entries(str(word.get("source") or ""), word_db)
    for token in source_tokens:
        token["review_status"] = token_statuses.get(str(token.get("source") or ""), "")
    return {
        "id": word.get("id"),
        "source": word.get("source"),
        "taigi": word.get("taigi"),
        "tailo": word.get("tailo"),
        "kind": word.get("kind", "word"),
        "category": word.get("category", "詞語"),
        "note": word.get("note", ""),
        "source_type": word.get("source_type", ""),
        "count": word.get("count", 0),
        "status": word.get("status", ""),
        "request_count": len(word.get("requests") or []),
        "play_count": int(stats_words.get(word.get("id", ""), {}).get("plays") or 0),
        "audio_play_count": int(stats_words.get(word.get("id", ""), {}).get("audio_plays") or 0),
        "video_play_count": int(stats_words.get(word.get("id", ""), {}).get("video_plays") or 0),
        **ratings,
        "problem": bool(word.get("problem")),
        "problem_type": word.get("problem_type", ""),
        "problem_reason": word.get("problem_reason", ""),
        "has_audio": bool(word.get("has_audio")),
        "has_video": bool(word.get("has_video")),
        "assets": public_word_assets(word, user_id),
        "itaigi_reference": word.get("itaigi_reference", {}),
        **token_summary,
        "source_tokens": source_tokens,
        "multilingual": word.get("multilingual", {}),
        "multilingual_request_count": len(word.get("multilingual_requests") or []),
        **generation,
        "updated_at": word.get("updated_at"),
        "generated_at": word.get("generated_at"),
    }


def segment_token_entries(source_text: str, word_db: dict) -> list[dict]:
    words = word_db.get("words", {})
    entries = []
    for source_word in tokenize_chinese(source_text):
        taigi_text = translate_chinese_to_taigi(source_word)
        tailo_text = tailo_for(taigi_text) if taigi_text else ""
        word_id = safe_word_id(source_word, taigi_text) if taigi_text else ""
        word = words.get(word_id, {})
        entries.append({
            "source": source_word,
            "taigi": word.get("taigi") or taigi_text,
            "tailo": word.get("tailo") or tailo_text,
            "word_id": word_id if word_id in words else "",
            "exists": word_id in words,
            "problem": bool(word.get("problem")),
            "has_audio": bool(word.get("has_audio")),
            "has_video": bool(word.get("has_video")),
            "generation_status": word_generation_status(word).get("generation_status") if word else "",
        })
    return entries


def token_review_statuses(reviews: list[dict], segment_index: int, user_id: str) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for review in sorted(reviews, key=lambda item: item.get("updated_at") or item.get("created_at") or 0):
        if int(review.get("segment_index") or 0) != segment_index:
            continue
        if user_id and review.get("user_id") != user_id:
            continue
        for correction in review.get("corrections") or []:
            source = str(correction.get("source_phrase") or "").strip()
            status = str(correction.get("status") or "").strip()
            if source and status in {"problem", "ok"}:
                statuses[source] = status
    return statuses


def word_token_review_statuses(word: dict, user_id: str) -> dict[str, str]:
    statuses: dict[str, str] = {}
    token_reviews = word.get("token_reviews") or {}
    review_sets = []
    if user_id and isinstance(token_reviews.get(user_id), dict):
        review_sets.append(token_reviews.get(user_id) or {})
    if isinstance(token_reviews.get("shared"), dict):
        review_sets.append(token_reviews.get("shared") or {})
    if not review_sets and isinstance(token_reviews, dict):
        review_sets = [token_reviews]
    for review_set in review_sets:
        for source, item in review_set.items():
            status = item.get("status") if isinstance(item, dict) else item
            if status in {"problem", "ok"}:
                statuses[str(source)] = str(status)
    return statuses


def word_token_review_summary(word: dict) -> dict:
    token_reviews = word.get("token_reviews") or {}
    latest_by_source: dict[str, dict] = {}
    if isinstance(token_reviews, dict):
        for review_set in token_reviews.values():
            if not isinstance(review_set, dict):
                continue
            for source, item in review_set.items():
                if not isinstance(item, dict):
                    continue
                status = item.get("status")
                if status not in {"problem", "ok"}:
                    continue
                updated_at = float(item.get("updated_at") or item.get("created_at") or 0)
                previous = latest_by_source.get(str(source))
                if previous is None or updated_at >= float(previous.get("updated_at") or 0):
                    latest_by_source[str(source)] = {"status": status, "updated_at": updated_at}
    problem_sources = sorted(source for source, item in latest_by_source.items() if item.get("status") == "problem")
    ok_sources = sorted(source for source, item in latest_by_source.items() if item.get("status") == "ok")
    return {
        "token_review_count": len(latest_by_source),
        "token_problem_count": len(problem_sources),
        "token_ok_count": len(ok_sources),
        "token_problem_sources": problem_sources,
        "token_ok_sources": ok_sources,
    }


def public_jobs_snapshot() -> dict:
    jobs = [
        job for job in app_data["jobs"].list()
        if job.status == "complete"
    ]
    payload_jobs = []
    for job in sorted(jobs, key=job_sort_score, reverse=True):
        item = present_job(job, admin=False, user_id="")
        item["static_media"] = public_media_for_job(job)
        item["segments_url"] = static_public_url(f"public/media/jobs/{job.id}/segments.json")
        payload_jobs.append(item)
    return {"jobs": payload_jobs, "total": len(payload_jobs), "updated_at": time.time()}


def public_words_snapshot() -> dict:
    db = load_word_db()
    stats_words = load_stats().get("words", {})
    words = []
    for word in db.get("words", {}).values():
        if not is_lexicon_material(str(word.get("source") or "")):
            continue
        item = public_word_entry(word, stats_words)
        item["static_media"] = public_media_for_word(word)
        words.append(item)
    words = sorted(
        words,
        key=lambda item: (
            float(item.get("rating_average") or 0),
            int(item.get("play_count") or 0),
            int(item.get("count") or 0),
        ),
        reverse=True,
    )
    return {"words": words, "total": len(words), "updated_at": time.time()}


def source_license_snapshot() -> dict:
    return {
        "title": "Data Sources and Licenses",
        "version": 1,
        "updated_at": time.time(),
        "policy": {
            "allowed_dependency": "Clear open-source dependencies may be used with license notices and source links.",
            "first_party_or_user_contributed": "First-party and user-contributed data must be covered by site terms before reuse.",
            "confirm_before_import": "External datasets require commercial-use, derivative-use, redistribution, and attribution review before import.",
            "do_not_import": "Sources without reusable licensing, or that forbid scraping/commercial use, must not be imported.",
        },
        "sources": [
            {"name": "VoxCPM / VoxCPM2", "license": "Apache-2.0", "status": "allowed_dependency", "links": ["https://github.com/OpenBMB/VoxCPM", "https://huggingface.co/openbmb/VoxCPM2"]},
            {"name": "PyTorch / torchaudio", "license": "BSD-style", "status": "allowed_dependency", "links": ["https://pytorch.org/", "https://github.com/pytorch/audio"]},
            {"name": "taibun", "license": "MIT", "status": "allowed_dependency", "links": ["https://github.com/andreihar/taibun", "https://pypi.org/project/taibun/"]},
            {"name": "jieba", "license": "MIT", "status": "allowed_dependency", "links": ["https://github.com/fxsjy/jieba", "https://pypi.org/project/jieba/"]},
            {"name": "FastAPI / Uvicorn", "license": "open-source dependency", "status": "allowed_dependency", "links": ["https://fastapi.tiangolo.com/", "https://www.uvicorn.org/"]},
            {"name": "React / Ant Design / Vite", "license": "MIT / Apache-2.0", "status": "allowed_dependency", "links": ["https://react.dev/", "https://ant.design/", "https://vite.dev/"]},
            {"name": "FFmpeg / FFprobe", "license": "GPL-3.0-or-later build", "status": "confirm_before_distribution", "links": ["https://ffmpeg.org/", "https://ffmpeg.org/legal.html", "https://formulae.brew.sh/formula/ffmpeg"]},
            {"name": "SQLite / PostgreSQL", "license": "public domain / PostgreSQL License", "status": "allowed_dependency", "links": ["https://www.sqlite.org/copyright.html", "https://www.postgresql.org/about/licence/"]},
            {"name": "User contributed lexicon", "license": "site terms required", "status": "first_party_or_user_contributed"},
            {"name": "MediaTek Research Breeze-ASR-26", "license": "Apache-2.0", "status": "allowed_dependency_for_audio_review", "links": ["https://huggingface.co/MediaTek-Research/Breeze-ASR-26", "https://huggingface.co/papers/2603.19259"]},
            {"name": "Meta MMS-TTS Chinese Min Nan (nan)", "license": "CC-BY-NC-4.0", "status": "noncommercial_comparison_only", "links": ["https://huggingface.co/facebook/mms-tts-nan", "https://huggingface.co/facebook/mms-tts"]},
            {"name": "MOE Taiwanese Taigi dictionary", "license": "pending review", "status": "confirm_before_import", "links": ["https://sutian.moe.edu.tw/"]},
            {"name": "iTaigi crowd Taigi dictionary", "license": "MIT project / CC0 database terms referenced by service terms", "status": "manual_reference_before_import", "links": ["https://github.com/i3thuan5/itaigi", "https://itaigi.tw/", "https://creativecommons.org/publicdomain/zero/1.0/", "http://docs.tai5uan5gian5gi2phing5thai5.apiary.io/#"]},
            {"name": "ChhoeTaigi community resources", "license": "dataset-level review required", "status": "confirm_before_import", "links": ["https://chhoe.taigi.info/", "https://github.com/ChhoeTaigi/ChhoeTaigiDatabase"]},
        ],
    }


def export_public_snapshots() -> dict:
    with snapshot_lock:
        jobs_snapshot = public_jobs_snapshot()
        words_snapshot = public_words_snapshot()
        stats_snapshot = public_stats()
        source_snapshot = source_license_snapshot()
        index_snapshot = {
            "version": 1,
            "updated_at": time.time(),
            "base_url": PUBLIC_STATIC_URL,
            "snapshots": {
                "stats": static_public_url("public/stats.json"),
                "jobs": static_public_url("public/jobs/index.json"),
                "lexicon": static_public_url("public/lexicon/index.json"),
                "sources": static_public_url("public/sources/license-ledger.json"),
            },
        }
        static_write_json("public/index.json", index_snapshot)
        static_write_json("public/stats.json", stats_snapshot)
        static_write_json("public/jobs/index.json", jobs_snapshot)
        static_write_json("public/lexicon/index.json", words_snapshot)
        static_write_json("public/sources/license-ledger.json", source_snapshot)
        return index_snapshot


def schedule_public_snapshot_export(delay: float = 0.5):
    global snapshot_scheduled
    with snapshot_lock:
        if snapshot_scheduled:
            return
        snapshot_scheduled = True

    def run_export():
        global snapshot_scheduled
        try:
            time.sleep(delay)
            export_public_snapshots()
        except Exception as exc:
            print(f"Failed to export public snapshots: {exc}", flush=True)
        finally:
            with snapshot_lock:
                snapshot_scheduled = False

    Thread(target=run_export, daemon=True).start()


def public_stats() -> dict:
    stats = load_stats()
    jobs = app_data["jobs"].list()
    word_db = load_word_db()
    words = [
        word for word in word_db.get("words", {}).values()
        if is_lexicon_material(str(word.get("source") or ""))
    ]
    completed_jobs = [job for job in jobs if job.status == "complete"]
    inventory = file_inventory()
    word_entries_rated = sum(1 for word in words if int(word_rating_summary(word).get("rating_count") or 0) > 0)
    word_assets = [asset for word in words for asset in public_word_assets(word)]
    word_assets_total = len(word_assets)
    word_assets_rated = sum(1 for asset in word_assets if int(asset.get("rating_count") or 0) > 0)
    word_assets_problem = sum(1 for word in words if word.get("problem"))
    word_token_summaries = [word_token_review_summary(word) for word in words]
    word_asset_jobs = [job for job in jobs if job.kind == "word_asset"]
    audio_review_jobs = [job for job in jobs if job.kind == "audio_review"]
    actions = stats.get("actions", {})
    today_actions = stats.get("daily", {}).get(stats_day_key(), {}).get("actions", {})
    source_exports = source_export_summary()
    job_problem_count = sum(1 for job in completed_jobs if job.problem)
    job_chinese_voice_count = sum(1 for job in completed_jobs if job.problem and job.problem_type == "chinese_voice_not_taigi")
    job_ok_count = sum(
        1 for job in completed_jobs
        if not job.problem and job.problem_reported_at is not None and str(job.problem_reported_by or "").strip()
    )
    job_reviewed_count = job_problem_count + job_ok_count
    job_unreviewed_count = max(0, len(completed_jobs) - job_reviewed_count)
    job_quality = {
        "completed_total": len(completed_jobs),
        "reviewed_total": job_reviewed_count,
        "problem_count": job_problem_count,
        "chinese_voice_not_taigi_count": job_chinese_voice_count,
        "ok_count": job_ok_count,
        "unreviewed_count": job_unreviewed_count,
        "problem_rate": round(job_problem_count / job_reviewed_count, 4) if job_reviewed_count else 0,
        "ok_rate": round(job_ok_count / job_reviewed_count, 4) if job_reviewed_count else 0,
        "reviewed_rate": round(job_reviewed_count / len(completed_jobs), 4) if completed_jobs else 0,
        "unreviewed_rate": round(job_unreviewed_count / len(completed_jobs), 4) if completed_jobs else 0,
    }

    def empty_rating_buckets() -> dict[str, int]:
        return {str(score): 0 for score in range(1, 6)}

    def add_average_rating_bucket(buckets: dict[str, int], average: float | int | None):
        if average is None:
            return
        score = max(1, min(5, int(float(average) + 0.5)))
        buckets[str(score)] += 1

    word_entry_rating_buckets = empty_rating_buckets()
    for word in words:
        add_average_rating_bucket(word_entry_rating_buckets, word_rating_summary(word).get("rating_average"))
    word_asset_rating_buckets = empty_rating_buckets()
    for asset in word_assets:
        add_average_rating_bucket(word_asset_rating_buckets, asset.get("rating_average"))

    segment_token_problem_count = 0
    segment_token_ok_count = 0
    for job in jobs:
        try:
            reviews = load_reviews(job)
        except Exception:
            continue
        for review in reviews:
            for correction in review.get("corrections") or []:
                status = str(correction.get("status") or "").strip()
                if status == "problem":
                    segment_token_problem_count += 1
                elif status == "ok":
                    segment_token_ok_count += 1

    lexicon_quality = {
        "word_entries_total": len(words),
        "word_entries_rated": word_entries_rated,
        "word_entries_unrated": max(0, len(words) - word_entries_rated),
        "word_assets_total": word_assets_total,
        "word_assets_rated": word_assets_rated,
        "word_assets_unrated": max(0, word_assets_total - word_assets_rated),
        "word_entry_rating_buckets": word_entry_rating_buckets,
        "word_asset_rating_buckets": word_asset_rating_buckets,
        "word_problem_count": word_assets_problem,
        "word_problem_rate": round(word_assets_problem / len(words), 4) if words else 0,
        "word_token_reviewed_entries": sum(1 for item in word_token_summaries if int(item.get("token_review_count") or 0) > 0),
        "word_token_problem_entries": sum(1 for item in word_token_summaries if int(item.get("token_problem_count") or 0) > 0),
        "word_token_problem_count": sum(int(item.get("token_problem_count") or 0) for item in word_token_summaries),
        "word_token_ok_count": sum(int(item.get("token_ok_count") or 0) for item in word_token_summaries),
        "segment_token_problem_count": segment_token_problem_count,
        "segment_token_ok_count": segment_token_ok_count,
        "word_regeneration_requests": int(actions.get("create_word_asset_job") or 0),
        "word_regeneration_complete": sum(1 for job in word_asset_jobs if job.status == "complete"),
        "word_regeneration_queued": sum(1 for job in word_asset_jobs if job.status == "queued"),
        "word_regeneration_running": sum(1 for job in word_asset_jobs if job.status == "running"),
        "word_regeneration_failed": sum(1 for job in word_asset_jobs if job.status == "failed"),
        "word_translation_requests": int(actions.get("request_word_translations") or 0),
        "source_export_requests": source_exports["total_requests"],
        "source_export_requesters": source_exports["requester_count"],
        "word_queries_total": sum(int(item.get("count") or 0) for item in word_db.get("queries", {}).values()),
        "word_assets_with_audio": sum(1 for asset in word_assets if asset.get("has_audio")),
        "word_assets_with_video": sum(1 for asset in word_assets if asset.get("has_video")),
        "audio_review_requests": len(audio_review_jobs),
        "audio_review_complete": sum(1 for job in audio_review_jobs if job.status == "complete"),
        "audio_review_queued": sum(1 for job in audio_review_jobs if job.status == "queued"),
        "audio_review_running": sum(1 for job in audio_review_jobs if job.status == "running"),
        "audio_review_failed": sum(1 for job in audio_review_jobs if job.status == "failed"),
    }
    return {
        **inventory,
        "total_plays": int(stats.get("total_plays") or 0),
        "audio_plays": int(stats.get("audio_plays") or 0),
        "video_plays": int(stats.get("video_plays") or 0),
        "jobs_total": len(jobs),
        "jobs_complete": len(completed_jobs),
        "jobs_running": sum(1 for job in jobs if job.status == "running"),
        "jobs_queued": sum(1 for job in jobs if job.status == "queued"),
        "jobs_failed": sum(1 for job in jobs if job.status == "failed"),
        "words_total": len(words),
        "word_queries_total": lexicon_quality["word_queries_total"],
        "page_visits_total": int(actions.get("page_visit") or 0),
        "page_visits_today": int(today_actions.get("page_visit") or 0),
        "source_exports": source_exports,
        "job_quality": job_quality,
        "lexicon_quality": lexicon_quality,
        "actions": actions,
        "daily": [
            {"date": date, **day}
            for date, day in sorted(stats.get("daily", {}).items())
        ],
        "updated_at": time.time(),
    }


def inline_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def title_from_text(text: str, limit: int = 48) -> str:
    cleaned = inline_text(text)
    first = re.split(r"(?<=[。！？!?])", cleaned, maxsplit=1)[0].strip() or cleaned
    return first[:limit] if len(first) > limit else first


def load_translation_memory() -> dict:
    with memory_lock:
        payload = load_json_state(
            TRANSLATION_MEMORY,
            {"terms": {}, "feedback": []},
            key="translation_memory",
            create=True,
        )
        payload.setdefault("terms", {})
        payload.setdefault("feedback", [])
        return payload


def save_translation_memory(payload: dict):
    with memory_lock:
        payload["updated_at"] = time.time()
        save_json_state(TRANSLATION_MEMORY, payload, key="translation_memory")


def remember_feedback(job_id: str, segment_index: int, feedback: SegmentFeedback):
    memory = load_translation_memory()
    word_db = load_word_db()
    word_db_changed = False
    terms = memory.setdefault("terms", {})
    now = time.time()
    for correction in feedback.corrections:
        if correction.status == "ok":
            continue
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
        if correction.taigi_correction.strip():
            word_db_changed = upsert_lexicon_entry(
                word_db,
                source,
                correction.taigi_correction.strip(),
                correction.tailo_correction.strip(),
                job_id=job_id,
                category="修正詞句" if len(source) >= 4 else "修正詞語",
                source_type="feedback_correction",
                generate_assets_flag=False,
            ) or word_db_changed
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
    if word_db_changed:
        save_word_db(word_db)


def apply_translation_memory(text: str) -> str:
    memory = load_translation_memory()
    terms = memory.get("terms", {})
    for source, entry in sorted(terms.items(), key=lambda item: len(item[0]), reverse=True):
        target = (entry or {}).get("taigi") or ""
        if source and target:
            text = text.replace(source, target)
    return text


def upsert_translation_memory_term(source: str, taigi: str, tailo: str = "", *, note: str = "", actor: str = "system") -> dict:
    source = source.strip()
    taigi = taigi.strip()
    if not source or not taigi:
        raise HTTPException(status_code=400, detail={"message": "請提供搜尋詞與台語替換詞。"})
    memory = load_translation_memory()
    terms = memory.setdefault("terms", {})
    now = time.time()
    entry = terms.setdefault(source, {"source": source, "taigi": "", "tailo": "", "count": 0})
    entry.update({
        "source": source,
        "taigi": taigi,
        "tailo": tailo.strip() or tailo_for(taigi),
        "note": note.strip(),
        "updated_at": now,
        "updated_by": actor,
    })
    entry["count"] = int(entry.get("count") or 0) + 1
    save_translation_memory(memory)
    return entry


PHRASE_MAP = [
    ("大家好", "逐家好"),
    ("珍珠奶茶", "真珠奶茶"),
    ("美元", "美金"),
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


def translate_chinese_to_taigi_rule(text: str) -> str:
    text = sanitize_text_for_tts(text)
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


def clean_taigi_llm_translation(text: str) -> str:
    text = sanitize_text_for_tts(text)
    text = text.strip()
    text = text.split("[/")[0].strip()
    text = re.sub(r"^[:：\s]+", "", text)
    text = re.sub(r"^(HAN|HL|POJ|台語|閩南語|翻譯)[:：]\s*", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip("` \n\r\t")


def translate_chinese_to_taigi_with_tw_llm(text: str, settings: AppSettings) -> str:
    base = settings.translator_api_base_url.strip().rstrip("/")
    model = settings.translator_model.strip()
    if not base or not model:
        raise ValueError("TW-Hokkien-LLM translator backend requires translator API base URL and model.")
    target_language = settings.translator_target_language or "HAN"
    prompt = f"[TRANS]\n{text.strip()}\n[/TRANS]\n[{target_language}]\n"
    body = {
        "model": model,
        "prompt": prompt,
        "temperature": 0,
        "max_tokens": 512,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if settings.translator_api_key.strip():
        headers["Authorization"] = f"Bearer {settings.translator_api_key.strip()}"
    req = urllib.request.Request(
        f"{base}/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    timeout = max(5, min(int(settings.translator_timeout_seconds or 90), 600))
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = json.loads(res.read().decode("utf-8"))
    choice = raw.get("choices", [{}])[0]
    generated = choice.get("text") or choice.get("message", {}).get("content", "")
    translated = clean_taigi_llm_translation(str(generated))
    if not translated:
        raise ValueError("TW-Hokkien-LLM translator returned empty text.")
    return translated


def translate_chinese_to_taigi(text: str, *, use_model: bool = False, settings: Optional[AppSettings] = None) -> str:
    if use_model:
        active_settings = settings or load_settings()
        if active_settings.translator_backend == "tw_hokkien_llm":
            try:
                return translate_chinese_to_taigi_with_tw_llm(text, active_settings)
            except Exception as exc:
                print(f"TW-Hokkien-LLM translation failed, falling back to rule translator: {exc}", flush=True)
    return translate_chinese_to_taigi_rule(text)


def build_segment_records(chinese_text: str, taigi_override: str, max_chars: int) -> list[dict]:
    chinese_text = sanitize_text_for_tts(chinese_text)
    taigi_override = sanitize_text_for_tts(taigi_override)
    source_segments = split_segments(chinese_text, max_chars)
    settings = load_settings()
    if taigi_override.strip():
        taigi_segments = split_segments(taigi_override.strip(), max_chars)
        if len(taigi_segments) < len(source_segments):
            taigi_segments.extend([""] * (len(source_segments) - len(taigi_segments)))
    else:
        taigi_segments = [translate_chinese_to_taigi(segment, use_model=True, settings=settings) for segment in source_segments]
    total = max(len(source_segments), len(taigi_segments))
    records = []
    for idx in range(total):
        source = source_segments[idx] if idx < len(source_segments) else ""
        taigi = taigi_segments[idx] if idx < len(taigi_segments) else ""
        if not taigi and source:
            taigi = translate_chinese_to_taigi(source, use_model=True, settings=settings)
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


def word_tts_unit_count(text: str) -> int:
    text = sanitize_text_for_tts(text).strip()
    if re.search(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]", text):
        parts = [
            part
            for part in re.split(r"[\s\-]+", text)
            if re.search(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]", part)
        ]
        if parts:
            return len(parts)
    cleaned = re.sub(r"[\s，。！？、,.!?;；:：()（）「」『』\"'’-]+", "", text)
    return len(cleaned)


def is_short_word_tts(text: str) -> bool:
    return word_tts_unit_count(text) <= 4


def word_tts_text(text: str) -> str:
    text = sanitize_text_for_tts(text).strip()
    if not text:
        return text
    if is_short_word_tts(text) and not re.search(r"[。！？!?]$", text):
        return f"{text}。"
    return text


def word_tts_control(text: str, voice_mode: str, voice_control: str) -> str:
    # VoxCPM CLI encodes --control by prepending it to the synthesis text in
    # parentheses. For 1-4 character words this often dominates the target and
    # makes the model continue into a long sentence. In reference voice mode the
    # reference audio already carries voice identity, so omit control for short words.
    if is_short_word_tts(text) and voice_mode == "default":
        return ""
    if is_short_word_tts(text):
        return "台灣台語，自然短詞，讀完就停"
    return voice_control


def max_word_audio_duration(text: str) -> float:
    units = max(1, word_tts_unit_count(text))
    if units <= 4:
        return 2.5 + units
    return min(20.0, max(6.5, units * 0.9 + 2.0))


def synthesize_word_audio(
    audio_path: Path,
    text: str,
    voice_mode: str,
    voice_control: str,
    device: str,
    timesteps: int,
    cfg_value: float,
):
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    reference_audio: Optional[Path] = None
    if voice_mode == "default":
        reference_audio = DEFAULT_REFERENCE_AUDIO.expanduser()
    target_text = word_tts_text(text)
    expected_max_duration = max_word_audio_duration(text)
    attempts = [(target_text, word_tts_control(text, voice_mode, voice_control), min(cfg_value, 2.0), max(4, min(timesteps, 8)))]
    if is_short_word_tts(text):
        attempts.extend([
            (target_text, "", 1.5, 4),
            (sanitize_text_for_tts(text).strip(), "", 1.2, 4),
        ])
    errors: list[str] = []
    for index, (attempt_text, attempt_control, attempt_cfg, attempt_steps) in enumerate(attempts, start=1):
        tmp_path = audio_path.with_name(f"{audio_path.stem}.attempt{index}{audio_path.suffix}")
        cmd = [
            VOXCPM_BIN, "clone" if reference_audio else "design",
            "--text", attempt_text,
            "--output", str(tmp_path),
            "--device", device,
            "--cache-dir", str(CACHE_DIR),
            "--no-denoiser",
            "--local-files-only",
            "--inference-timesteps", str(attempt_steps),
            "--cfg-value", str(attempt_cfg),
            "--retry-badcase",
            "--retry-badcase-max-times", "3",
        ]
        if attempt_control:
            cmd.extend(["--control", attempt_control])
        if reference_audio and reference_audio.exists():
            cmd.extend(["--reference-audio", str(reference_audio)])
        try:
            run(cmd)
            generated_duration = duration(tmp_path)
            if generated_duration <= expected_max_duration:
                tmp_path.replace(audio_path)
                return generated_duration
            errors.append(f"attempt {index}: {generated_duration:.2f}s > {expected_max_duration:.2f}s")
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
    raise RuntimeError(f"詞語語音生成異常過長，已拒絕保存：{'; '.join(errors)}")


def word_synthesis_text(word: dict) -> tuple[str, str]:
    preferred = str(word.get("generation_synthesis_source") or word.get("preferred_synthesis_source") or "").strip()
    if preferred == "taigi":
        taigi_text = str(word.get("taigi") or "").strip()
        if taigi_text:
            return taigi_text, "taigi"
    elif preferred == "tailo":
        tailo_text = str(word.get("tailo") or "").strip()
        if tailo_text:
            return tailo_text, "tailo"
    taigi_text = str(word.get("taigi") or "").strip()
    if taigi_text:
        return taigi_text, "taigi"
    tailo_text = str(word.get("tailo") or "").strip()
    return tailo_text, "tailo"


def itaigi_hapsing_audio_url(tailo_text: str) -> str:
    taibun = sanitize_text_for_tts(tailo_text or "").replace("/", " 。 ").strip()
    if not taibun:
        return ""
    return f"https://hapsing.itaigi.tw/bangtsam?taibun={quote(taibun)}"


def itaigi_audio_available(audio_url: str) -> bool:
    if not audio_url:
        return False
    try:
        req = urllib.request.Request(audio_url, method="HEAD")
        with urllib.request.urlopen(req, timeout=8) as res:
            return 200 <= int(getattr(res, "status", 0) or 0) < 400
    except Exception:
        return False


def fetch_itaigi_references(query: str) -> dict:
    query = re.sub(r"\s+", " ", sanitize_text_for_tts(query or "")).strip()
    if not query:
        raise HTTPException(status_code=400, detail={"message": "請先輸入要查詢的詞語。"})
    api_url = f"https://itaigi.tw/{quote('平臺項目列表')}/{quote('揣列表')}?{urlencode({'關鍵字': query})}"
    source_url = f"https://itaigi.tw/k/{quote(query)}"
    try:
        req = urllib.request.Request(api_url, headers={"User-Agent": "TaigiVoiceVideoWeb/1.0"})
        with urllib.request.urlopen(req, timeout=15) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"message": f"無法查詢 iTaigi：{exc}"}) from exc

    candidates = []
    seen: set[tuple[str, str]] = set()
    for row in payload.get("列表", []) or []:
        for item in row.get("新詞文本", []) or []:
            taigi_text = str(item.get("文本資料") or "").strip()
            tailo_text = str(item.get("音標資料") or "").strip()
            if not taigi_text and not tailo_text:
                continue
            key = (taigi_text, tailo_text)
            if key in seen:
                continue
            seen.add(key)
            good = int(item.get("按呢講好") or 0)
            bad = int(item.get("按呢無好") or 0)
            audio_url = itaigi_hapsing_audio_url(tailo_text)
            candidates.append({
                "id": str(item.get("新詞文本項目編號") or sha256(f"{taigi_text}\n{tailo_text}".encode("utf-8")).hexdigest()[:12]),
                "taigi": taigi_text,
                "tailo": tailo_text,
                "contributor": str(item.get("貢獻者") or ""),
                "good": good,
                "bad": bad,
                "score": good - bad,
                "audio_url": audio_url,
                "audio_available": itaigi_audio_available(audio_url),
                "source_url": source_url,
            })
    candidates.sort(key=lambda item: (item["score"], item["good"], -item["bad"]), reverse=True)
    return {
        "source": "iTaigi",
        "query": query,
        "source_url": source_url,
        "api_url": api_url,
        "license_note": "iTaigi 作為人工參考來源；套用前仍保留來源網址與票數，避免未審核資料直接混入第一方詞庫而無來源紀錄。",
        "candidates": candidates,
    }


def run(
    cmd: list[str],
    cwd: Path = ROOT,
    timeout: int = SUBPROCESS_TIMEOUT_SECONDS,
    heartbeat: Optional[Callable[[], None]] = None,
):
    command = " ".join(str(part) for part in cmd[:3])
    if heartbeat is not None:
        started_at = time.monotonic()
        next_heartbeat = started_at + max(5, COMMAND_HEARTBEAT_SECONDS)
        process = subprocess.Popen(cmd, cwd=cwd)
        try:
            while True:
                returncode = process.poll()
                if returncode is not None:
                    if returncode != 0:
                        raise subprocess.CalledProcessError(returncode, cmd)
                    return
                now = time.monotonic()
                if now - started_at > timeout:
                    process.kill()
                    process.wait()
                    raise TimeoutError(f"External command timed out after {timeout}s: {command}")
                if now >= next_heartbeat:
                    heartbeat()
                    next_heartbeat = now + max(5, COMMAND_HEARTBEAT_SECONDS)
                time.sleep(1)
        except Exception:
            if process.poll() is None:
                process.kill()
                process.wait()
            raise
    try:
        subprocess.run(cmd, cwd=cwd, check=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"External command timed out after {timeout}s: {command}") from exc


def safe_word_id(source: str, taigi: str) -> str:
    digest = sha256(f"{source}\n{taigi}".encode("utf-8")).hexdigest()[:16]
    slug = re.sub(r"[^A-Za-z0-9]+", "-", source).strip("-").lower()[:32] or "word"
    return f"{slug}-{digest}"


def word_kind(source: str) -> str:
    return "phrase" if len(source) >= 4 else "word"


LEXICON_MIN_COMPACT_CHARS = 2
LEXICON_MAX_COMPACT_CHARS = 36
LEXICON_SENTENCE_MAX_COMPACT_CHARS = 24
LEXICON_SINGLE_TOKEN_STOP_CHARS = set("我的你他她它了是在和與及或也都很更最就又還聽看說講用把被讓給有無不沒會能可對從到以於")


def lexicon_compact_source(source: str) -> str:
    return re.sub(r"\s+", "", source or "").strip()


def lexicon_sentence_mark_count(source: str) -> int:
    return len(re.findall(r"[。！？!?]", source or ""))


def is_lexicon_material(source: str) -> bool:
    text = (source or "").strip()
    compact = lexicon_compact_source(text)
    if len(compact) < LEXICON_MIN_COMPACT_CHARS:
        return False
    if "\n" in text or "\r" in text:
        return False
    sentence_marks = lexicon_sentence_mark_count(text)
    if sentence_marks >= 2:
        return False
    if len(compact) > LEXICON_MAX_COMPACT_CHARS:
        return False
    if sentence_marks == 1 and len(compact) > LEXICON_SENTENCE_MAX_COMPACT_CHARS:
        return False
    return True


def seed_fixed_phrases(payload: dict) -> dict:
    words = payload.setdefault("words", {})
    changed = False
    for seed in FIXED_PHRASE_SEEDS:
        word_id = safe_word_id(seed["source"], seed["taigi"])
        if word_id in words:
            existing = words[word_id]
            existing.setdefault("category", seed["category"])
            existing.setdefault("kind", "phrase")
            existing.setdefault("note", seed.get("note", ""))
            continue
        words[word_id] = {
            "id": word_id,
            "source": seed["source"],
            "taigi": seed["taigi"],
            "tailo": seed["tailo"],
            "kind": "phrase",
            "category": seed["category"],
            "note": seed.get("note", ""),
            "source_type": "seed",
            "count": 0,
            "jobs": [],
            "updated_at": time.time(),
        }
        changed = True
    if changed:
        payload["updated_at"] = time.time()
    return payload


def load_word_db() -> dict:
    with word_db_lock:
        payload = load_json_state(
            WORD_DB,
            {"words": {}, "queries": {}, "updated_at": 0},
            key="word_db",
            create=True,
        )
        payload.setdefault("words", {})
        payload.setdefault("queries", {})
        payload = seed_fixed_phrases(payload)
        return payload


def save_word_db(payload: dict):
    with word_db_lock:
        payload["updated_at"] = time.time()
        save_json_state(WORD_DB, payload, key="word_db")
    schedule_public_snapshot_export()


SUPPORTED_CORPUS_LANGUAGES = ["zh-Hant", "zh-Hans", "en", "ja", "ko", "taigi", "tailo"]

TRADITIONAL_TO_SIMPLIFIED = str.maketrans({
    "臺": "台", "灣": "湾", "語": "语", "詞": "词", "辭": "辞", "聲": "声", "音": "音",
    "體": "体", "產": "产", "業": "业", "學": "学", "習": "习", "資": "资", "庫": "库",
    "與": "与", "轉": "转", "譯": "译", "記": "记", "錄": "录", "廣": "广", "東": "东",
    "門": "门", "開": "开", "關": "关", "題": "题", "點": "点", "聽": "听", "說": "说",
    "講": "讲", "買": "买", "賣": "卖", "這": "这", "個": "个", "會": "会", "後": "后",
    "時": "时", "間": "间", "數": "数", "據": "据", "網": "网", "頁": "页", "標": "标",
    "準": "准", "確": "确", "實": "实", "發": "发", "現": "现", "還": "还", "進": "进",
    "輸": "输", "錯": "错", "對": "对", "國": "国", "電": "电", "腦": "脑", "員": "员",
})


def simplified_text(text: str) -> str:
    return text.translate(TRADITIONAL_TO_SIMPLIFIED)


def word_multilingual_entry(word: dict, lang: str, requester_id: str, requester_name: str, overwrite: bool = False) -> dict:
    now = time.time()
    existing = word.setdefault("multilingual", {}).get(lang)
    if existing and not overwrite:
        return existing
    if lang == "zh-Hant":
        text = word.get("source", "")
        status = "draft"
        note = "以原始中文詞條建立。"
    elif lang == "zh-Hans":
        text = simplified_text(word.get("source", ""))
        status = "draft"
        note = "以保守繁簡字表產生，仍建議人工校對。"
    elif lang == "taigi":
        text = word.get("taigi", "")
        status = "draft"
        note = "以目前台語詞條建立，可由使用者修正。"
    elif lang == "tailo":
        text = word.get("tailo", "") or tailo_for(word.get("taigi", ""))
        status = "draft"
        note = "以目前台羅拼音建立，可由使用者修正。"
    else:
        text = ""
        status = "pending"
        note = "已申請多語系語料，等待人工翻譯或外部翻譯服務補稿。"
    return {
        "language": lang,
        "text": text,
        "status": status,
        "note": note,
        "requested_by_id": requester_id,
        "requested_by_name": requester_name,
        "requested_at": now,
        "updated_at": now,
    }


def request_word_multilingual_corpus(word: dict, languages: list[str], requester_id: str, requester_name: str, overwrite: bool = False) -> dict:
    requested = [lang for lang in languages if lang in SUPPORTED_CORPUS_LANGUAGES] or SUPPORTED_CORPUS_LANGUAGES
    multilingual = word.setdefault("multilingual", {})
    for lang in requested:
        multilingual[lang] = word_multilingual_entry(word, lang, requester_id, requester_name, overwrite)
    requests = word.setdefault("multilingual_requests", [])
    requests.append({
        "languages": requested,
        "requested_by_id": requester_id,
        "requested_by_name": requester_name,
        "requested_at": time.time(),
        "overwrite": overwrite,
    })
    word["updated_at"] = time.time()
    return word


def remember_word_query(query: str):
    query = query.strip()
    if not query:
        return
    record_stat_action("word_query", "query", query)
    db = load_word_db()
    queries = db.setdefault("queries", {})
    item = queries.get(query, {"query": query, "count": 0, "created_at": time.time()})
    item["count"] = int(item.get("count") or 0) + 1
    item["updated_at"] = time.time()
    queries[query] = item
    save_word_db(db)


def create_requested_word_entry(payload: WordCreateRequest, requester_id: str, requester_name: str) -> dict:
    source = payload.source.strip()
    if not source:
        raise HTTPException(status_code=400, detail={"message": "請輸入想新增的詞語。"})
    if not is_lexicon_material(source):
        raise HTTPException(
            status_code=400,
            detail={"message": "這段內容太長，不適合加入語詞與固定語句資料庫；請選取較短的詞語或固定語句。"},
        )
    taigi_text = payload.taigi.strip() or translate_chinese_to_taigi(source)
    tailo_text = payload.tailo.strip() or tailo_for(taigi_text)
    word_id = safe_word_id(source, taigi_text)
    db = load_word_db()
    words = db.setdefault("words", {})
    now = time.time()
    existing = words.get(word_id, {})
    requests = existing.setdefault("requests", [])
    requests.append({
        "source": source,
        "taigi": payload.taigi.strip(),
        "tailo": payload.tailo.strip(),
        "note": payload.note.strip(),
        "requested_by_id": requester_id,
        "requested_by_name": requester_name,
        "requested_at": now,
    })
    word = {
        **existing,
        "id": word_id,
        "source": source,
        "taigi": taigi_text,
        "tailo": tailo_text,
        "kind": existing.get("kind") or word_kind(source),
        "category": existing.get("category") or ("固定語句" if word_kind(source) == "phrase" else "詞語"),
        "note": existing.get("note") or payload.note.strip(),
        "source_type": existing.get("source_type") or "user_requested",
        "status": existing.get("status") or "requested",
        "count": int(existing.get("count") or 0),
        "jobs": existing.get("jobs", []),
        "requests": requests,
        "request_count": len(requests),
        "requested_at": existing.get("requested_at") or now,
        "updated_at": now,
    }
    words[word_id] = word
    save_word_db(db)
    return word


def upsert_lexicon_entry(db: dict, source: str, taigi_text: str, tailo_text: str, job_id: str = "", category: str = "", source_type: str = "generated", generate_assets_flag: bool = False, payload: Optional[CreateJobRequest] = None, voice_mode: str = "default", voice_control: str = "") -> bool:
    source = source.strip()
    taigi_text = taigi_text.strip()
    if not source or not taigi_text or not is_lexicon_material(source):
        return False
    words = db.setdefault("words", {})
    word_id = safe_word_id(source, taigi_text)
    existing = words.get(word_id, {})
    entry = {
        **existing,
        "id": word_id,
        "source": source,
        "taigi": taigi_text,
        "tailo": tailo_text or tailo_for(taigi_text),
        "kind": existing.get("kind") or word_kind(source),
        "category": category or existing.get("category") or ("固定語句" if word_kind(source) == "phrase" else "詞語"),
        "source_type": existing.get("source_type") or source_type,
        "jobs": sorted(set(existing.get("jobs", []) + ([job_id] if job_id else []))),
        "count": int(existing.get("count") or 0) + (1 if job_id else 0),
        "updated_at": time.time(),
    }
    if generate_assets_flag and payload is not None:
        try:
            entry = generate_word_assets(
                entry,
                voice_mode=voice_mode,
                voice_control=voice_control,
                device=payload.device,
                timesteps=payload.inference_timesteps,
                cfg_value=payload.cfg_value,
                force=bool(existing.get("problem")),
            )
        except Exception as exc:
            entry["asset_error"] = str(exc)
    words[word_id] = entry
    return True


def tokenize_chinese(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", "", text)
    if not cleaned:
        return []
    memory_terms = sorted(
        [term for term in load_translation_memory().get("terms", {}).keys() if len(term) > 1],
        key=len,
        reverse=True,
    )
    protected: list[str] = []
    idx = 0
    while idx < len(cleaned):
        matched = next((term for term in memory_terms if cleaned.startswith(term, idx)), "")
        if matched:
            protected.append(matched)
            idx += len(matched)
            continue
        end = idx + 1
        while end < len(cleaned) and not any(cleaned.startswith(term, end) for term in memory_terms):
            end += 1
        chunk = cleaned[idx:end]
        protected.extend(list(jieba.cut(chunk, cut_all=False)) if jieba else re.findall(r"[\u4e00-\u9fff]{1,4}|[A-Za-z0-9]+", chunk))
        idx = end
    raw_words = protected
    raw_words = merge_short_lexicon_tokens(raw_words)
    words = []
    for word in raw_words:
        word = word.strip()
        if not word or re.fullmatch(r"[，。！？、；：,.!?;:「」『』（）()]+", word):
            continue
        if is_lexicon_material(word):
            words.append(word)
    return words


def merge_short_lexicon_tokens(tokens: list[str]) -> list[str]:
    merged: list[str] = []
    carry = ""
    punctuation = re.compile(r"^[，。！？、；：,.!?;:「」『』（）()]+$")
    for token in tokens:
        token = str(token or "").strip()
        if not token:
            continue
        if punctuation.fullmatch(token):
            carry = ""
            continue
        compact_len = len(lexicon_compact_source(token))
        if compact_len < LEXICON_MIN_COMPACT_CHARS:
            if token in LEXICON_SINGLE_TOKEN_STOP_CHARS:
                carry = ""
                continue
            if carry:
                merged.append(f"{carry}{token}")
                carry = ""
            else:
                carry = token
            continue
        if carry:
            merged.append(f"{carry}{token}")
            carry = ""
        else:
            merged.append(token)
    return merged


def make_word_background(path: Path, title: str, tailo_text: str = ""):
    width, height = 1920, 1080
    image = Image.new("RGB", (width, height), (8, 11, 18))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        color = (8 + int(y / height * 18), 11 + int(y / height * 26), 18 + int(y / height * 34))
        draw.line([(0, y), (width, y)], fill=color)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle([0, 0, width, 132], fill=(0, 0, 0, 96))
    od.rectangle([0, 710, width, height], fill=(0, 0, 0, 76))
    font_path = font_path_for_cjk()
    title_font = ImageFont.truetype(font_path, 66)
    word_font = ImageFont.truetype(font_path, 150)
    tailo_font = ImageFont.truetype(font_path, 54)
    small = ImageFont.truetype(font_path, 30)
    od.text((72, 42), "語詞聲音", font=title_font, fill=(245, 248, 255, 255))
    od.text((72, 106), "VoxCPM 台語單詞語音 · 詞庫素材", font=small, fill=(178, 210, 220, 255))
    word_lines = wrap_text(title, word_font, 1500)
    if len(word_lines) > 2:
        word_font = ImageFont.truetype(font_path, 112)
        word_lines = wrap_text(title, word_font, 1540)
    word_lines = word_lines[:3]
    line_height = word_font.size + 28
    tailo_lines = wrap_text(tailo_text, tailo_font, 1500)[:2] if tailo_text else []
    total_height = len(word_lines) * line_height + (len(tailo_lines) * (tailo_font.size + 18) if tailo_lines else 0)
    y = 480 - total_height // 2
    for line in word_lines:
        tw = od.textlength(line, font=word_font)
        od.text(((width - tw) / 2, y), line, font=word_font, fill=(255, 255, 255, 255), stroke_width=5, stroke_fill=(0, 0, 0, 190))
        y += line_height
    if tailo_lines:
        y += 10
        for line in tailo_lines:
            tw = od.textlength(line, font=tailo_font)
            od.text(((width - tw) / 2, y), line, font=tailo_font, fill=(184, 238, 244, 255), stroke_width=2, stroke_fill=(0, 0, 0, 150))
            y += tailo_font.size + 18
    Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB").save(path)


def generate_word_video(word_dir: Path, title: str, audio_path: Path, tailo_text: str = "") -> Path:
    bg_path = word_dir / "word_background.png"
    make_word_background(bg_path, title, tailo_text)
    video_path = word_dir / "word_video.mp4"
    cmd = [
        FFMPEG, "-y",
        "-loop", "1", "-i", str(bg_path),
        "-i", str(audio_path),
        "-filter_complex",
        "[1:a]showspectrum=s=1920x300:slide=scroll:mode=combined:color=rainbow:scale=sqrt:fps=30,format=rgba,colorchannelmixer=aa=0.50[spec];"
        "[1:a]showwaves=s=1920x410:mode=cline:rate=30:colors=00f5ff,format=rgba,split=2[w1][w2];"
        "[w2]gblur=sigma=18,colorchannelmixer=aa=0.46[glow];"
        "[0:v]scale=1920:1080,fps=30,format=rgba[bg];"
        "[bg][spec]overlay=0:710[tmp1];"
        "[tmp1][glow]overlay=0:328[tmp2];"
        "[tmp2][w1]overlay=0:328,format=yuv420p[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart",
        str(video_path),
    ]
    run(cmd, timeout=VIDEO_RENDER_TIMEOUT_SECONDS)
    return video_path


def generate_word_assets(word: dict, voice_mode: str, voice_control: str, device: str, timesteps: int, cfg_value: float, force: bool = False) -> dict:
    word_dir = WORD_ASSET_DIR / word["id"]
    word_dir.mkdir(parents=True, exist_ok=True)
    audio_path = word_dir / "word.wav"
    video_path = word_dir / "word.mp4"
    needs_regen = force or word.get("problem") or not audio_path.exists() or not video_path.exists()
    if not needs_regen:
        return {
            **word,
            "audio_path": str(audio_path),
            "video_path": str(video_path),
            "has_audio": True,
            "has_video": True,
        }

    synthesis_text, synthesis_source = word_synthesis_text(word)
    generated_duration = synthesize_word_audio(
        audio_path,
        synthesis_text,
        voice_mode,
        voice_control,
        device,
        timesteps,
        cfg_value,
    )
    generated_video = generate_word_video(word_dir, word["taigi"], audio_path, word.get("tailo", ""))
    if generated_video != video_path:
        shutil.move(generated_video, video_path)
    return {
        **word,
        "audio_path": str(audio_path),
        "video_path": str(video_path),
        "has_audio": audio_path.exists(),
        "has_video": video_path.exists(),
        "problem": False,
        "problem_type": "",
        "problem_reason": "",
        "duration": generated_duration,
        "synthesis_text": synthesis_text,
        "synthesis_source": synthesis_source,
        "generated_at": time.time(),
    }


def word_asset_rating_summary(asset: dict, user_id: str = "") -> dict:
    ratings = asset.get("ratings", {})
    values = [int(item.get("rating") or 0) for item in ratings.values() if int(item.get("rating") or 0) > 0]
    mine = ratings.get(user_id) if user_id else None
    return {
        "rating_average": round(sum(values) / len(values), 2) if values else None,
        "rating_count": len(values),
        "my_rating": mine.get("rating") if mine else None,
        "my_note": mine.get("note", "") if mine else "",
    }


def public_word_assets(word: dict, user_id: str = "") -> list[dict]:
    assets = list(word.get("assets") or [])
    current_tailo = str(word.get("tailo") or "").strip()
    current_taigi = str(word.get("taigi") or "").strip()
    reference = word.get("itaigi_reference") if isinstance(word.get("itaigi_reference"), dict) else {}
    reference_tailo = str(reference.get("tailo") or "").strip()
    if not assets and word.get("audio_path"):
        assets.append({
            "id": "legacy",
            "audio_path": word.get("audio_path"),
            "video_path": word.get("video_path"),
            "has_audio": bool(word.get("has_audio")),
            "has_video": bool(word.get("has_video")),
            "synthesis_text": word.get("synthesis_text", ""),
            "synthesis_source": word.get("synthesis_source", ""),
            "created_at": word.get("generated_at") or word.get("updated_at"),
            "generated_by_id": "system:legacy",
            "generated_by_name": "系統既有素材",
            "ratings": {},
        })
    stats_words = load_stats().get("words", {})
    asset_stats = stats_words.get(word.get("id", ""), {}).get("assets", {})
    public_assets = []
    for asset in assets:
        asset_id = asset.get("id")
        ratings = word_asset_rating_summary(asset, user_id)
        synthesis_text = str(asset.get("synthesis_text") or "").strip()
        synthesis_source = str(asset.get("synthesis_source") or "").strip()
        matches_current_reference = bool(
            synthesis_text
            and synthesis_source == "tailo"
            and synthesis_text in {current_tailo, reference_tailo}
        )
        public_assets.append({
            "id": asset_id,
            "has_audio": bool(asset.get("has_audio")),
            "has_video": bool(asset.get("has_video")),
            "synthesis_text": synthesis_text,
            "synthesis_source": synthesis_source,
            "matches_current_reference": matches_current_reference,
            "matches_current_word": bool(
                synthesis_text
                and (
                    synthesis_text == current_tailo
                    or synthesis_text == current_taigi
                )
            ),
            "created_at": asset.get("created_at"),
            "generated_by_name": asset.get("generated_by_name", "匿名使用者"),
            "generated_by_id": asset.get("generated_by_id", ""),
            "play_count": int(asset_stats.get(asset_id, {}).get("plays") or 0),
            "audio_play_count": int(asset_stats.get(asset_id, {}).get("audio_plays") or 0),
            "video_play_count": int(asset_stats.get(asset_id, {}).get("video_plays") or 0),
            **ratings,
        })
    public_assets.sort(
        key=lambda item: (
            1 if item.get("matches_current_reference") else 0,
            float(item.get("rating_average") or 0),
            int(item.get("play_count") or 0),
            item.get("created_at") or 0,
        ),
        reverse=True,
    )
    return public_assets


def generate_word_asset_variant(word: dict, voice_mode: str, voice_control: str, device: str, timesteps: int, cfg_value: float, generated_by_id: str, generated_by_name: str) -> tuple[dict, dict]:
    asset_id = f"asset-{uuid.uuid4().hex[:12]}"
    word_dir = WORD_ASSET_DIR / word["id"] / "assets" / asset_id
    word_dir.mkdir(parents=True, exist_ok=True)
    audio_path = word_dir / "word.wav"
    video_path = word_dir / "word.mp4"
    synthesis_text, synthesis_source = word_synthesis_text(word)
    generated_duration = synthesize_word_audio(
        audio_path,
        synthesis_text,
        voice_mode,
        voice_control,
        device,
        timesteps,
        cfg_value,
    )
    generated_video = generate_word_video(word_dir, word["taigi"], audio_path, word.get("tailo", ""))
    if generated_video != video_path:
        shutil.move(generated_video, video_path)
    asset = {
        "id": asset_id,
        "audio_path": str(audio_path),
        "video_path": str(video_path),
        "has_audio": audio_path.exists(),
        "has_video": video_path.exists(),
        "duration": generated_duration,
        "synthesis_text": synthesis_text,
        "synthesis_source": synthesis_source,
        "created_at": time.time(),
        "generated_by_id": generated_by_id,
        "generated_by_name": generated_by_name,
        "ratings": {},
    }
    updated = {
        **word,
        "audio_path": str(audio_path),
        "video_path": str(video_path),
        "has_audio": audio_path.exists(),
        "has_video": video_path.exists(),
        "problem": False,
        "problem_reason": "",
        "generated_at": asset["created_at"],
        "assets": [asset] + list(word.get("assets") or []),
    }
    return updated, asset


def word_rating_summary(word: dict, user_id: str = "") -> dict:
    ratings = word.get("ratings", {})
    values = [int(item.get("rating") or 0) for item in ratings.values() if int(item.get("rating") or 0) > 0]
    mine = ratings.get(user_id) if user_id else None
    return {
        "rating_average": round(sum(values) / len(values), 2) if values else None,
        "rating_count": len(values),
        "my_rating": mine.get("rating") if mine else None,
        "my_note": mine.get("note", "") if mine else "",
    }


def update_word_database_for_job(job_id: str, segment_records: list[dict], payload: CreateJobRequest, voice_mode: str, voice_control: str):
    db = load_word_db()
    changed = False
    for segment in segment_records:
        source_sentence = str(segment.get("source_text") or "").strip()
        taigi_sentence = str(segment.get("taigi_text") or "").strip()
        tailo_sentence = str(segment.get("tailo_text") or "").strip()
        if len(source_sentence) >= 4 and is_lexicon_material(source_sentence):
            changed = upsert_lexicon_entry(
                db,
                source_sentence,
                taigi_sentence,
                tailo_sentence,
                job_id=job_id,
                category="固定語句",
                source_type="generated_sentence",
                generate_assets_flag=False,
            ) or changed
        for source_word in tokenize_chinese(segment.get("source_text", "")):
            taigi_word = translate_chinese_to_taigi(source_word)
            if not taigi_word:
                continue
            tailo_word = tailo_for(taigi_word)
            changed = upsert_lexicon_entry(
                db,
                source_word,
                taigi_word,
                tailo_word,
                job_id=job_id,
                category="詞語",
                source_type="generated_word",
                generate_assets_flag=False,
                payload=payload,
                voice_mode=voice_mode,
                voice_control=voice_control,
            ) or changed
    if changed:
        save_word_db(db)


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


def make_video(
    job_dir: Path,
    title: str,
    audio_path: Path,
    segments: list[dict],
    heartbeat: Optional[Callable[[], None]] = None,
) -> Path:
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
    run(cmd, timeout=VIDEO_RENDER_TIMEOUT_SECONDS, heartbeat=heartbeat)
    return video_path


def make_archive(job_dir: Path) -> Path:
    zip_path = job_dir / "taigi_voice_video_job.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in job_dir.rglob("*"):
            if path.is_file() and path != zip_path:
                zf.write(path, path.relative_to(job_dir))
    return zip_path


def onedrive_root() -> Path:
    return Path.home() / "Library" / "CloudStorage" / "OneDrive-Personal" / "Codex-VoxCPM-Taigi-Web"


def safe_onedrive_name(value: str, fallback: str = "job") -> str:
    value = re.sub(r"[\\/:*?\"<>|]+", "-", value.strip())
    value = re.sub(r"\s+", " ", value).strip(" .")
    return (value or fallback)[:80]


def copy_file_if_changed(source: Path, target: Path):
    if target.exists():
        source_stat = source.stat()
        target_stat = target.stat()
        if target_stat.st_size == source_stat.st_size and target_stat.st_mtime >= source_stat.st_mtime:
            return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def copy_job_outputs_to_onedrive(job_id: str, title: str, output_dir: Path, extra_paths: Optional[list[Path]] = None) -> Optional[Path]:
    root = onedrive_root()
    if not root.parent.exists():
        return None
    dest = root / f"{job_id}-{safe_onedrive_name(title)}"
    dest.mkdir(parents=True, exist_ok=True)
    if output_dir.exists():
        for path in output_dir.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(output_dir)
            target = dest / relative
            copy_file_if_changed(path, target)
    for path in extra_paths or []:
        if not path.exists() or not path.is_file():
            continue
        target = dest / path.name
        if path.resolve() != target.resolve():
            copy_file_if_changed(path, target)
    return dest


def write_segment_text_files(segments_dir: Path, segment: dict):
    idx = int(segment["index"])
    (segments_dir / f"seg_{idx:02d}.source.txt").write_text(str(segment.get("source_text") or ""), encoding="utf-8")
    (segments_dir / f"seg_{idx:02d}.txt").write_text(str(segment.get("taigi_text") or ""), encoding="utf-8")
    (segments_dir / f"seg_{idx:02d}.tailo.txt").write_text(str(segment.get("tailo_text") or ""), encoding="utf-8")


def synthesize_segment_audio(
    wav_path: Path,
    text: str,
    voice_mode: str,
    voice_control: str,
    device: str,
    timesteps: int,
    cfg_value: float,
):
    text = sanitize_text_for_tts(text)
    reference_audio: Optional[Path] = None
    if voice_mode == "default":
        reference_audio = DEFAULT_REFERENCE_AUDIO.expanduser()
        if not reference_audio.exists():
            raise FileNotFoundError(f"Reference audio not found: {reference_audio}")
    tmp_path = wav_path.with_name(f"{wav_path.stem}.regenerating{wav_path.suffix}")
    cmd = [
        VOXCPM_BIN, "clone" if voice_mode == "default" else "design",
        "--text", text,
        "--control", voice_control,
        "--output", str(tmp_path),
        "--device", device,
        "--cache-dir", str(CACHE_DIR),
        "--no-denoiser",
        "--local-files-only",
        "--inference-timesteps", str(timesteps),
        "--cfg-value", str(cfg_value),
    ]
    if reference_audio:
        cmd.extend(["--reference-audio", str(reference_audio)])
    run(cmd)
    tmp_path.replace(wav_path)


def segment_replacement_from_texts(
    segment: dict,
    corrected_taigi: str = "",
    corrected_tailo: str = "",
    preferred_synthesis_source: str = "taigi",
) -> dict[str, str]:
    corrected_taigi = corrected_taigi.strip()
    corrected_tailo = corrected_tailo.strip()
    current_taigi = str(segment.get("taigi_text") or "").strip()
    current_tailo = str(segment.get("tailo_text") or "").strip()
    requested_taigi = corrected_taigi or str(segment.get("corrected_taigi_text") or "").strip()
    requested_tailo = corrected_tailo or str(segment.get("corrected_tailo_text") or "").strip()
    taigi_text = requested_taigi or current_taigi
    tailo_text = requested_tailo or current_tailo
    taigi_changed = bool(requested_taigi and requested_taigi != current_taigi)
    tailo_changed = bool(requested_tailo and requested_tailo != current_tailo)
    if taigi_changed and not tailo_changed:
        tailo_text = tailo_for(requested_taigi)
    if not tailo_text and taigi_text:
        tailo_text = tailo_for(taigi_text)
    if preferred_synthesis_source == "taigi" and taigi_text:
        synthesis_text = taigi_text
        synthesis_source = "taigi"
    elif preferred_synthesis_source == "tailo" and tailo_text:
        synthesis_text = tailo_text
        synthesis_source = "tailo"
    elif taigi_changed:
        synthesis_text = requested_taigi
        synthesis_source = "corrected_taigi"
    elif tailo_changed:
        synthesis_text = requested_tailo
        synthesis_source = "corrected_tailo"
    elif requested_taigi:
        synthesis_text = requested_taigi
        synthesis_source = "corrected_taigi"
    elif requested_tailo:
        synthesis_text = requested_tailo
        synthesis_source = "corrected_tailo"
    else:
        synthesis_text = taigi_text or tailo_text
        synthesis_source = "taigi" if taigi_text else "tailo"
    return {
        "taigi_text": taigi_text,
        "tailo_text": tailo_text,
        "synthesis_text": synthesis_text,
        "synthesis_source": synthesis_source,
    }


def rebuild_job_outputs(
    job: Job,
    segments_payload: dict,
    *,
    render_video: bool = True,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> tuple[Path, Optional[Path], Path]:
    output_dir = Path(job.output_dir or JOB_ROOT / job.id / "output")
    segments_dir = output_dir / "segments"
    segments = sorted(segments_payload.get("segments", []), key=lambda item: int(item.get("index") or 0))
    if not segments:
        raise ValueError("No segments to rebuild.")

    wav_paths: list[Path] = []
    for segment in segments:
        idx = int(segment.get("index") or 0)
        wav_path = segments_dir / f"seg_{idx:02d}.wav"
        if not wav_path.exists():
            raise FileNotFoundError(f"Segment audio not found: {wav_path}")
        segment["audio_file"] = f"segments/{wav_path.name}"
        wav_paths.append(wav_path)

    concat_path = segments_dir / "concat.txt"
    concat_path.write_text("".join(f"file '{path.name}'\n" for path in wav_paths), encoding="utf-8")
    audio_path = output_dir / "taigi_voice.wav"
    if progress_callback:
        progress_callback("Joining regenerated audio", 76)
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path.name), "-c", "copy", str(audio_path)], cwd=segments_dir)

    if progress_callback:
        progress_callback("Preparing regenerated subtitles", 82)
    timeline = []
    cursor = 0.0
    for segment, wav_path in zip(segments, wav_paths):
        dur = duration(wav_path)
        segment["duration"] = dur
        segment["start"] = cursor
        segment["end"] = cursor + dur
        timeline.append({
            "index": segment["index"],
            "start": cursor,
            "end": cursor + dur,
            "duration": dur,
            "text": segment.get("taigi_text", ""),
            "source_text": segment.get("source_text", ""),
            "tailo_text": segment.get("tailo_text", ""),
            "audio_file": segment["audio_file"],
        })
        cursor += dur

    (output_dir / "taigi_draft.txt").write_text("\n".join(str(segment.get("taigi_text") or "") for segment in segments), encoding="utf-8")
    (output_dir / "tailo.txt").write_text("\n".join(str(segment.get("tailo_text") or "") for segment in segments), encoding="utf-8")
    save_state_json_file(output_dir / "subtitles.json", {"duration": cursor, "segments": timeline})
    save_state_json_file(output_dir / "segments.json", {"segments": segments})

    if progress_callback:
        progress_callback("Rendering regenerated waveform video", 88)
    video_path = make_video(
        output_dir,
        job.title,
        audio_path,
        timeline,
        heartbeat=lambda: progress_callback("Rendering regenerated waveform video", 88) if progress_callback else None,
    ) if render_video and job.video_path else None
    if progress_callback:
        progress_callback("Packaging regenerated outputs", 96)
    zip_path = make_archive(output_dir)
    return audio_path, video_path, zip_path


def regenerate_job_segments_from_texts(
    job: Job,
    segments_payload: dict,
    replacements: dict[int, dict[str, str]],
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> tuple[list[dict], Path, Optional[Path], Path]:
    output_dir = Path(job.output_dir or JOB_ROOT / job.id / "output")
    segments_dir = output_dir / "segments"
    voice_mode = (output_dir / "voice_mode.txt").read_text(encoding="utf-8").strip() if (output_dir / "voice_mode.txt").exists() else load_settings().default_reference_voice_mode
    voice_control = (output_dir / "voice_control.txt").read_text(encoding="utf-8").strip() if (output_dir / "voice_control.txt").exists() else resolve_voice_control("default_male")
    regenerated = []
    total = len(replacements)
    current = 0
    for segment in segments_payload.get("segments", []):
        idx = int(segment.get("index") or 0)
        if idx not in replacements:
            continue
        replacement = replacements[idx]
        new_taigi = str(replacement.get("taigi_text") or segment.get("taigi_text") or "").strip()
        new_tailo = str(replacement.get("tailo_text") or "").strip() or tailo_for(new_taigi)
        synthesis_text = str(replacement.get("synthesis_text") or new_taigi or new_tailo).strip()
        if not synthesis_text:
            continue
        wav_path = segments_dir / f"seg_{idx:02d}.wav"
        current += 1
        if progress_callback:
            progress = 12 + int((current - 1) / max(total, 1) * 58)
            progress_callback(f"Regenerating audio segment {idx} ({current}/{total})", progress)
        synthesize_segment_audio(wav_path, synthesis_text, voice_mode, voice_control, DEFAULT_DEVICE, 10, 2.5)
        segment["taigi_text"] = new_taigi
        segment["tailo_text"] = new_tailo
        segment["corrected_taigi_text"] = new_taigi
        segment["corrected_tailo_text"] = new_tailo
        segment["last_synthesis_text"] = synthesis_text
        segment["last_synthesis_source"] = str(replacement.get("synthesis_source") or "taigi")
        segment["regenerated_at"] = time.time()
        segment["audio_file"] = f"segments/{wav_path.name}"
        write_segment_text_files(segments_dir, segment)
        regenerated.append(segment)
    if not regenerated:
        raise ValueError("No segment text available for regeneration.")
    audio_path, video_path, zip_path = rebuild_job_outputs(
        job,
        segments_payload,
        render_video=True,
        progress_callback=progress_callback,
    )
    return regenerated, audio_path, video_path, zip_path


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
            write_segment_text_files(segments_dir, record)
        jobs.update(job_id, segment_count=len(segment_records), stage=f"Generating {len(segment_records)} audio segments", progress=20)

        voice_mode = payload.reference_voice_mode or load_settings().default_reference_voice_mode
        voice_control = resolve_voice_control(payload.control)
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
            synthesize_segment_audio(
                wav_path,
                record["taigi_text"],
                voice_mode,
                voice_control,
                payload.device,
                payload.inference_timesteps,
                payload.cfg_value,
            )
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
        save_state_json_file(output_dir / "subtitles.json", {"duration": cursor, "segments": timeline})
        save_state_json_file(output_dir / "segments.json", {"segments": segment_records})

        jobs.update(job_id, stage="Updating word database", progress=82)
        update_word_database_for_job(job_id, segment_records, payload, voice_mode, voice_control)

        video_path = None
        if payload.make_video:
            jobs.update(job_id, stage="Rendering waveform video", progress=84)
            video_path = make_video(
                output_dir,
                payload.title,
                audio_path,
                timeline,
                heartbeat=lambda: jobs.update(job_id, stage="Rendering waveform video", progress=84),
            )

        jobs.update(job_id, stage="Packaging outputs", progress=94)
        zip_path = make_archive(output_dir)
        onedrive_dir = copy_job_outputs_to_onedrive(job_id, payload.title, output_dir)

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


def site_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def dist_index_html(request: Request) -> Optional[HTMLResponse]:
    index = FRONTEND_DIST / "index.html"
    if not index.exists():
        return None
    html = index.read_text(encoding="utf-8")
    html = html.replace("__SITE_URL__", site_base_url(request))
    return HTMLResponse(html)


def rss_date(ts: float | int | None) -> str:
    return formatdate(float(ts or time.time()), usegmt=True)


def feed_item(title: str, link: str, description: str, guid: str, updated_at: float | int | None) -> str:
    return "\n".join([
        "    <item>",
        f"      <title>{xml_escape(title)}</title>",
        f"      <link>{xml_escape(link)}</link>",
        f"      <guid isPermaLink=\"false\">{xml_escape(guid)}</guid>",
        f"      <pubDate>{rss_date(updated_at)}</pubDate>",
        f"      <description>{xml_escape(description)}</description>",
        "    </item>",
    ])


def rss_feed_xml(request: Request) -> str:
    base_url = site_base_url(request)
    items: list[tuple[float, str]] = []
    for job in app_data["jobs"].list():
        if job.status != "complete" or job.kind not in {"script", "segment_regeneration"}:
            continue
        title = job.title or title_from_text(job.chinese_text) or "新的台語語音影片"
        description = first_sentence(job.chinese_text) or "新的台語語音與字幕波形影片已完成。"
        link = f"{base_url}/?tab=jobs"
        updated = job.completed_at or job.updated_at or job.created_at
        items.append((float(updated or 0), feed_item(
            f"文章：{title}",
            link,
            description,
            f"job:{job.id}",
            updated,
        )))
    word_db = load_word_db()
    for word in word_db.get("words", {}).values():
        source = str(word.get("source") or "").strip()
        if not source:
            continue
        taigi_text = str(word.get("taigi") or "").strip()
        tailo_text = str(word.get("tailo") or "").strip()
        description = " / ".join(part for part in [taigi_text, tailo_text, str(word.get("note") or "").strip()] if part)
        updated = word.get("updated_at") or word.get("generated_at") or word.get("created_at")
        items.append((float(updated or 0), feed_item(
            f"詞彙：{source}",
            f"{base_url}/?tab=lexicon",
            description or "語詞與固定語句資料庫有新的詞條更新。",
            f"word:{word.get('id') or source}",
            updated,
        )))
    body = "\n".join(item for _, item in sorted(items, key=lambda pair: pair[0], reverse=True)[:30])
    updated_at = max([timestamp for timestamp, _ in items], default=time.time())
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Taigi Voice Video Web</title>
    <link>{xml_escape(base_url)}/</link>
    <description>台語語音影片、分段校稿、語詞與固定語句資料庫更新。</description>
    <language>zh-TW</language>
    <lastBuildDate>{rss_date(updated_at)}</lastBuildDate>
{body}
  </channel>
</rss>
"""


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    dist = dist_index_html(request)
    if dist:
        return dist
    return HTMLResponse("<h1>Taigi Voice Video Web</h1><p>Build the frontend with npm run build.</p>")


@app.get("/og-image.png")
async def og_image():
    path = FRONTEND_DIST / "og-image.png"
    if not path.exists():
        path = FRONTEND_DIST / "assets" / "og-image.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="image/png")


@app.get("/feed.xml")
async def rss_feed(request: Request):
    return FastAPIResponse(rss_feed_xml(request), media_type="application/rss+xml; charset=utf-8")


@app.get("/rss.xml")
async def rss_feed_alias(request: Request):
    return FastAPIResponse(rss_feed_xml(request), media_type="application/rss+xml; charset=utf-8")


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
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Email 格式不正確。")
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
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired login link.")
    session = create_session(email)
    response = JSONResponse({
        "authenticated": True,
        "is_admin": email == ADMIN_EMAIL,
        "email": email,
        "session_token": session,
        "expires_at": time.time() + SESSION_TTL_SECONDS,
    })
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
    revoke_session(bearer_token_from_request(request))
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE)
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return response


@app.get("/auth/status")
async def auth_status(
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    email = authenticated_email(request)
    is_admin = is_authorized(request, taigi_web_token_cookie, authorization)
    anonymous_profile = None if email else ensure_anonymous_profile(review_user_id(request, response))
    return {
        "authenticated": bool(email) or is_admin,
        "is_admin": is_admin,
        "email": email,
        "anonymous": anonymous_profile,
        "anonymous_nickname_options": ANON_TAIGI_NICKNAMES,
        "token_required": True,
        "loopback_only": not PUBLIC_ACCESS and not bool(web_token()),
        "public_access": PUBLIC_ACCESS,
        "auth_method": "email_magic_link",
    }


@app.put("/auth/anonymous-nickname")
async def update_anonymous_nickname(payload: AnonymousNicknameRequest, request: Request, response: Response):
    user_id = review_user_id(request, response)
    profile = set_anonymous_nickname(user_id, payload.nickname)
    return {"saved": True, "anonymous": profile, "anonymous_nickname_options": ANON_TAIGI_NICKNAMES}


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
        "llm_random_sentence_enabled": bool(settings.llm_api_base_url and settings.llm_api_key and settings.llm_model),
        "translator_backend": settings.translator_backend,
        "tw_hokkien_llm_translator_enabled": bool(
            settings.translator_backend == "tw_hokkien_llm"
            and settings.translator_api_base_url
            and settings.translator_model
        ),
        "reference_voice_modes": [
            {"value": "default", "label": "預設聲音"},
            {"value": "random", "label": "隨機生成"},
        ],
        "voice_control_options": [
            {"value": option["value"], "label": option["label"]}
            for option in VOICE_CONTROL_OPTIONS
        ],
        "anonymous_nickname_options": [
            {"value": nickname, "label": nickname}
            for nickname in ANON_TAIGI_NICKNAMES
        ],
        "audio_review": {
            "breeze_asr_model": BREEZE_ASR_MODEL,
            "breeze_asr_enabled": ENABLE_BREEZE_ASR,
            "mms_tts_model": MMS_TTS_MODEL,
            "mms_tts_enabled": ENABLE_MMS_TTS,
            "mms_tts_license": "CC-BY-NC-4.0 non-commercial comparison only",
        },
        "pipeline": ["translate", "segment", "tts", "join", "subtitle", "video", "package"],
    }
    if not PUBLIC_ACCESS:
        info["job_dir"] = str(JOB_ROOT)
        info["translation_memory"] = str(TRANSLATION_MEMORY)
    return info


@app.get("/external/itaigi/search")
async def external_itaigi_search(q: str):
    query = re.sub(r"\s+", " ", q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")
    return {
        "source": "iTaigi",
        "query": query,
        "search_url": f"https://itaigi.tw/k/{quote(query)}",
        "api_url": f"https://itaigi.tw/平臺項目列表/揣列表?{urlencode({'關鍵字': query})}",
        "project_url": "https://github.com/i3thuan5/itaigi",
        "license_note": "iTaigi project references MIT for code and CC0 database contribution terms; keep data as manual reference until import provenance is reviewed.",
        "import_policy": "manual_reference_before_import",
    }


@app.get("/api/status")
async def api_status(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    private_client = is_private_client(request)
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    rate_state = {
        "limit_seconds": max(60, int(load_settings().public_rate_limit_seconds)),
        "wait_seconds": 0,
        "can_submit": True,
        "next_available_at": time.time(),
        "sentence_limit": None,
        "max_chars": PUBLIC_ANONYMOUS_MAX_CHARS,
    } if admin_or_token or private_client or is_authenticated(request) else public_rate_limit_state(request)
    return {
        "authenticated": admin_or_token or is_authenticated(request),
        "private_client": private_client,
        "rate_limit": rate_state,
        "queue": queue_status(),
    }


@app.get("/words")
async def search_words(
    request: Request,
    q: str = "",
    limit: int = 50,
):
    remember_word_query(q)
    db = load_word_db()
    query = q.strip().lower()
    items = [
        item for item in db.get("words", {}).values()
        if is_lexicon_material(str(item.get("source") or ""))
    ]
    if query:
        items = [
            item for item in items
            if query in str(item.get("source", "")).lower()
            or query in str(item.get("taigi", "")).lower()
            or query in str(item.get("tailo", "")).lower()
            or query in str(item.get("category", "")).lower()
            or query in str(item.get("note", "")).lower()
        ]
    stats_words = load_stats().get("words", {})
    user_id = review_user_id(request)
    items.sort(
        key=lambda item: (
            float(word_rating_summary(item).get("rating_average") or 0),
            int(stats_words.get(item.get("id", ""), {}).get("plays") or 0),
            int(item.get("count") or 0),
            item.get("updated_at") or 0,
        ),
        reverse=True,
    )
    public_items = []
    for item in items[: max(1, min(limit, 200))]:
        public_items.append(public_word_entry(item, stats_words, user_id))
    return {"words": public_items, "total": len(items)}


@app.get("/stats")
async def stats_page_data():
    return public_stats()


@app.post("/snapshots/export")
async def export_public_snapshots_endpoint(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    return export_public_snapshots()


@app.post("/stats/action")
async def record_action_endpoint(payload: StatActionRequest):
    record_stat_action(payload.action, payload.target_type, payload.target_id, metadata=payload.metadata)
    return {"saved": True}


@app.post("/maintenance/unsafe-tts-cleanup")
async def enqueue_unsafe_tts_cleanup_endpoint(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    job = enqueue_unsafe_tts_cleanup_job("manual")
    return present_job(job, True, review_user_id(request))


@app.post("/llm/random-sentence")
async def random_sentence_endpoint(payload: RandomSentenceRequest):
    result = generate_random_sentence(payload)
    record_stat_action("generate_random_sentence", "llm", result.source)
    return result


@app.post("/sources/export-requests")
async def request_source_export(payload: SourceExportRequest, request: Request):
    email = require_email_login(request)
    return record_source_export_request(email, payload)


@app.post("/words/requests")
async def request_new_word(payload: WordCreateRequest, request: Request, response: Response):
    email = authenticated_email(request)
    user_id = f"admin:{email}" if email == ADMIN_EMAIL else f"user:{email}" if email else review_user_id(request, response)
    word = create_requested_word_entry(payload, user_id, reviewer_display_name(user_id))
    record_stat_action("request_new_word", "word", word["id"], metadata={"email": email or "", "anonymous": not bool(email)})
    return {
        "saved": True,
        "word": {
            "id": word.get("id"),
            "source": word.get("source"),
            "taigi": word.get("taigi"),
            "tailo": word.get("tailo"),
            "status": word.get("status"),
            "request_count": len(word.get("requests") or []),
        },
    }


@app.post("/words/candidates")
async def create_word_candidate(payload: WordCreateRequest, request: Request, response: Response):
    user_id = review_user_id(request, response)
    word = create_requested_word_entry(payload, user_id, reviewer_display_name(user_id))
    record_stat_action("request_word_candidate", "word", word["id"])
    return {"saved": True, "word": public_word_entry(word, load_stats().get("words", {}), user_id)}


@app.post("/words/{word_id}/rating")
async def rate_word(word_id: str, payload: WordRatingRequest, request: Request, response: Response):
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail={"message": "評分必須介於 1 到 5。"})
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    user_id = review_user_id(request, response)
    ratings = word.setdefault("ratings", {})
    existing = ratings.get(user_id, {})
    ratings[user_id] = {
        "rating": payload.rating,
        "note": payload.note,
        "created_at": existing.get("created_at", time.time()),
        "updated_at": time.time(),
    }
    word.update(word_rating_summary(word, user_id))
    word["updated_at"] = time.time()
    db["words"][word_id] = word
    save_word_db(db)
    record_stat_action("rate_word", "word", word_id)
    return {"saved": True, "stats": word_rating_summary(word, user_id)}


@app.post("/words/{word_id}/generate")
async def generate_word_asset_endpoint(word_id: str, payload: WordGenerateRequest, request: Request, response: Response):
    user_id = review_user_id(request, response)
    word, job = enqueue_word_generation_job(word_id, user_id, reviewer_display_name(user_id), synthesis_source=payload.synthesis_source)
    admin_or_token = is_authorized(request, None, None)
    return {
        "queued": True,
        "job": present_job(job, admin_or_token, user_id) if job else None,
        "word": {
            k: word.get(k)
            for k in (
                "id",
                "source",
                "taigi",
                "tailo",
                "has_audio",
                "has_video",
                "problem",
                "generation_status",
                "generation_stage",
                "generation_progress",
                "generation_position",
                "generation_job_id",
            )
        },
    }


@app.get("/words/{word_id}/itaigi-reference")
async def get_word_itaigi_reference(word_id: str):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    query = str(word.get("source") or word.get("taigi") or "").strip()
    result = fetch_itaigi_references(query)
    word["itaigi_reference_last_lookup"] = {
        "looked_up_at": time.time(),
        "query": result["query"],
        "candidate_count": len(result["candidates"]),
        "source_url": result["source_url"],
    }
    db["words"][word_id] = word
    save_word_db(db)
    record_stat_action("lookup_itaigi_reference", "word", word_id, metadata={"candidate_count": len(result["candidates"])})
    return result


@app.post("/words/{word_id}/itaigi-reference/apply")
async def apply_word_itaigi_reference(
    word_id: str,
    payload: WordItaigiReferenceApplyRequest,
    request: Request,
    response: Response,
):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    taigi_text = payload.taigi.strip()
    tailo_text = payload.tailo.strip()
    if not taigi_text or not tailo_text:
        raise HTTPException(status_code=400, detail={"message": "iTaigi 參考資料缺少台語文字或台羅，無法套用。"})
    user_id = review_user_id(request, response)
    now = time.time()
    word.update({
        "taigi": taigi_text,
        "tailo": tailo_text,
        "problem": False,
        "problem_type": "",
        "problem_reason": "",
        "itaigi_reference": {
            "source": "iTaigi",
            "source_url": payload.source_url.strip() or f"https://itaigi.tw/k/{quote(str(word.get('source') or taigi_text))}",
            "taigi": taigi_text,
            "tailo": tailo_text,
            "audio_url": payload.audio_url.strip() or itaigi_hapsing_audio_url(tailo_text),
            "good": payload.good,
            "bad": payload.bad,
            "applied_by_id": user_id,
            "applied_by_name": reviewer_display_name(user_id),
            "applied_at": now,
        },
        "updated_at": now,
    })
    db["words"][word_id] = word
    save_word_db(db)
    word, job = enqueue_word_generation_job(word_id, user_id, reviewer_display_name(user_id))
    admin_or_token = is_authorized(request, None, None)
    record_stat_action("apply_itaigi_reference", "word", word_id, metadata={"job_id": job.id if job else "", "tailo": tailo_text})
    return {
        "saved": True,
        "queued": bool(job),
        "word": public_word_entry(word, load_stats().get("words", {}), user_id),
        "job": present_job(job, admin_or_token, user_id) if job else None,
    }


@app.post("/words/{word_id}/issue")
async def report_word_issue(word_id: str, payload: WordIssueRequest):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    word["problem"] = True
    word["problem_type"] = payload.issue_type.strip()
    word["problem_reason"] = payload.reason.strip() or "使用者回報詞語素材有問題"
    word["problem_reported_at"] = time.time()
    db["words"][word_id] = word
    save_word_db(db)
    return {"saved": True, "word": {k: word.get(k) for k in ("id", "source", "taigi", "tailo", "problem", "problem_type", "problem_reason")}}


@app.post("/words/{word_id}/token-reviews")
async def save_word_token_reviews(word_id: str, payload: WordTokenReviewRequest, request: Request, response: Response):
    if not payload.tokens:
        raise HTTPException(status_code=400, detail={"message": "請先選取要標示的詞。"})
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    token_sources = {item.get("source") for item in segment_token_entries(str(word.get("source") or ""), db)}
    user_id = review_user_id(request, response)
    token_reviews = word.setdefault("token_reviews", {})
    user_reviews = token_reviews.setdefault(user_id, {})
    now = time.time()
    saved = 0
    for item in payload.tokens:
        source = item.source.strip()
        if not source or source not in token_sources:
            continue
        existing = user_reviews.get(source, {})
        user_reviews[source] = {
            "status": item.status,
            "created_at": existing.get("created_at", now) if isinstance(existing, dict) else now,
            "updated_at": now,
        }
        saved += 1
    if saved == 0:
        raise HTTPException(status_code=400, detail={"message": "沒有可儲存的斷詞標示。"})
    word["updated_at"] = now
    db["words"][word_id] = word
    save_word_db(db)
    record_stat_action("review_word_tokens", "word", word_id, metadata={"count": saved})
    return {"saved": True, "word": public_word_entry(word, load_stats().get("words", {}), user_id)}


@app.post("/words/{word_id}/translations")
async def request_word_translations(word_id: str, payload: WordTranslationRequest, request: Request, response: Response):
    email = require_email_login(request)
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    user_id = f"admin:{email}" if email == ADMIN_EMAIL else f"user:{email}"
    requester_name = reviewer_display_name(user_id)
    word = request_word_multilingual_corpus(
        word,
        payload.languages,
        requester_id=user_id,
        requester_name=requester_name,
        overwrite=payload.overwrite,
    )
    db["words"][word_id] = word
    save_word_db(db)
    record_stat_action("request_word_translations", "word", word_id, metadata={"languages": payload.languages, "email": email})
    return {
        "saved": True,
        "word": {
            "id": word.get("id"),
            "source": word.get("source"),
            "taigi": word.get("taigi"),
            "tailo": word.get("tailo"),
            "multilingual": word.get("multilingual", {}),
            "multilingual_request_count": len(word.get("multilingual_requests") or []),
        },
    }


@app.post("/words/{word_id}/assets/{asset_id}/rating")
async def rate_word_asset(word_id: str, asset_id: str, payload: WordAssetRatingRequest, request: Request, response: Response):
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail={"message": "評分必須介於 1 到 5。"})
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    assets = word.setdefault("assets", [])
    if asset_id == "legacy" and not assets and word.get("audio_path"):
        assets.append({
            "id": "legacy",
            "audio_path": word.get("audio_path"),
            "video_path": word.get("video_path"),
            "has_audio": bool(word.get("has_audio")),
            "has_video": bool(word.get("has_video")),
            "created_at": word.get("generated_at") or word.get("updated_at"),
            "generated_by_id": "system:legacy",
            "generated_by_name": "系統既有素材",
            "ratings": {},
        })
    asset = next((item for item in assets if item.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail={"message": "找不到這筆詞語語音。"})
    user_id = review_user_id(request, response)
    ratings = asset.setdefault("ratings", {})
    existing = ratings.get(user_id, {})
    ratings[user_id] = {
        "rating": payload.rating,
        "note": payload.note,
        "created_at": existing.get("created_at", time.time()),
        "updated_at": time.time(),
    }
    word["assets"] = assets
    word["updated_at"] = time.time()
    db["words"][word_id] = word
    save_word_db(db)
    record_stat_action("rate_word_asset", "word_asset", f"{word_id}:{asset_id}")
    return {"saved": True, "stats": word_asset_rating_summary(asset, user_id)}


@app.get("/words/{word_id}/download/{kind}")
async def download_word_asset(word_id: str, kind: Literal["audio", "video"]):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    path = Path(word.get("audio_path" if kind == "audio" else "video_path") or "")
    if not path.exists() or WORD_ASSET_DIR not in path.parents:
        raise HTTPException(status_code=404, detail={"message": "這個詞語還沒有可下載的素材。"})
    media_type = "audio/wav" if kind == "audio" else "video/mp4"
    increment_play(kind, "word", word_id)
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": content_disposition(word_download_filename(word, kind, path))})


@app.get("/words/{word_id}/media/{kind}")
async def media_word_asset(word_id: str, kind: Literal["audio", "video"]):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    path = Path(word.get("audio_path" if kind == "audio" else "video_path") or "")
    if not path.exists() or WORD_ASSET_DIR not in path.parents:
        raise HTTPException(status_code=404, detail={"message": "這個詞語還沒有可播放的素材。"})
    media_type = "audio/wav" if kind == "audio" else "video/mp4"
    increment_play(kind, "word", word_id)
    return FileResponse(path, media_type=media_type)


@app.get("/words/{word_id}/assets/{asset_id}/download/{kind}")
async def download_word_asset_variant(word_id: str, asset_id: str, kind: Literal["audio", "video"]):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    if asset_id == "legacy":
        asset = {
            "audio_path": word.get("audio_path"),
            "video_path": word.get("video_path"),
        }
    else:
        asset = next((item for item in word.get("assets", []) if item.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail={"message": "找不到這筆詞語語音。"})
    path = Path(asset.get("audio_path" if kind == "audio" else "video_path") or "")
    if not path.exists() or WORD_ASSET_DIR not in path.parents:
        raise HTTPException(status_code=404, detail={"message": "這筆詞語語音還沒有可下載的素材。"})
    media_type = "audio/wav" if kind == "audio" else "video/mp4"
    increment_play(kind, "word", word_id, job_id=asset_id)
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": content_disposition(word_download_filename(word, kind, path))})


@app.get("/words/{word_id}/assets/{asset_id}/media/{kind}")
async def media_word_asset_variant(word_id: str, asset_id: str, kind: Literal["audio", "video"]):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    if asset_id == "legacy":
        asset = {
            "audio_path": word.get("audio_path"),
            "video_path": word.get("video_path"),
        }
    else:
        asset = next((item for item in word.get("assets", []) if item.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail={"message": "找不到這筆詞語語音。"})
    path = Path(asset.get("audio_path" if kind == "audio" else "video_path") or "")
    if not path.exists() or WORD_ASSET_DIR not in path.parents:
        raise HTTPException(status_code=404, detail={"message": "這筆詞語語音還沒有可播放的素材。"})
    media_type = "audio/wav" if kind == "audio" else "video/mp4"
    increment_play(kind, "word", word_id, job_id=asset_id)
    return FileResponse(path, media_type=media_type)


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
    schema_name = postgres_schema_name(settings.postgres_schema)
    normalized = settings.model_copy(update={
        "public_rate_limit_seconds": max(60, int(settings.public_rate_limit_seconds)),
        "api_access_token": settings.api_access_token.strip(),
        "postgres_dsn": settings.postgres_dsn.strip(),
        "postgres_schema": schema_name,
        "translator_backend": settings.translator_backend,
        "translator_api_base_url": settings.translator_api_base_url.strip().rstrip("/"),
        "translator_api_key": settings.translator_api_key.strip(),
        "translator_model": settings.translator_model.strip(),
        "translator_target_language": settings.translator_target_language,
        "translator_timeout_seconds": max(5, min(int(settings.translator_timeout_seconds), 600)),
        "llm_api_base_url": settings.llm_api_base_url.strip().rstrip("/"),
        "llm_api_key": settings.llm_api_key.strip(),
        "llm_model": settings.llm_model.strip(),
        "object_storage_bucket": settings.object_storage_bucket.strip(),
        "object_storage_prefix": settings.object_storage_prefix.strip().strip("/"),
        "object_storage_endpoint_url": settings.object_storage_endpoint_url.strip().rstrip("/"),
        "object_storage_region": settings.object_storage_region.strip(),
        "object_storage_profile": settings.object_storage_profile.strip(),
        "object_storage_public_url": settings.object_storage_public_url.strip().rstrip("/") or PUBLIC_STATIC_URL,
    })
    save_settings(normalized)
    return normalized


@app.post("/admin/postgres/export")
async def export_postgres(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    return export_sqlite_to_postgres(load_settings())


@app.post("/admin/static/sync")
async def sync_static_storage(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    return sync_public_static_to_object_storage(load_settings())


@app.post("/admin/tools/term-regenerate")
async def batch_regenerate_segments_by_term(
    payload: TermBatchRegenerateRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    search_term = payload.search_term.strip()
    taigi_replacement = payload.taigi_replacement.strip()
    if not search_term or not taigi_replacement:
        raise HTTPException(status_code=400, detail={"message": "請提供搜尋詞與台語替換詞。"})
    memory_entry = upsert_translation_memory_term(
        search_term,
        taigi_replacement,
        note="Admin 批次詞語修正工具建立。",
        actor=authenticated_email(request) or "admin",
    )
    owner_id = review_user_id(request, response)
    max_jobs = max(1, min(int(payload.max_jobs or 50), 200))
    matches = []
    queued_jobs = []
    for job in sorted(app_data["jobs"].list(), key=lambda item: item.updated_at or item.created_at, reverse=True):
        if len(matches) >= max_jobs:
            break
        if job.kind != "script" or job.status != "complete":
            continue
        segments_payload = ensure_job_segments_payload(job)
        if not segments_payload:
            continue
        replacements: dict[int, dict[str, str]] = {}
        segment_matches = []
        for segment in segments_payload.get("segments", []):
            if not segment_matches_term(segment, search_term):
                continue
            idx = int(segment.get("index") or 0)
            replacement = replacement_for_term_segment(segment, search_term, taigi_replacement)
            segment_matches.append({
                "index": idx,
                "source_text": str(segment.get("source_text") or ""),
                "taigi_text": str(segment.get("taigi_text") or ""),
                "replacement_taigi_text": replacement.get("taigi_text") if replacement else "",
                "will_regenerate": bool(replacement),
            })
            if replacement:
                replacements[idx] = replacement
        if not segment_matches:
            continue
        match_item = {
            "job_id": job.id,
            "title": job.title,
            "segment_count": len(segment_matches),
            "regeneratable_count": len(replacements),
            "segments": segment_matches,
        }
        matches.append(match_item)
        if payload.dry_run or not replacements:
            continue
        regeneration_job = enqueue_segment_regeneration_job(job, owner_id, replacements, 0)
        queued_jobs.append(present_job(regeneration_job, True, owner_id))
    if not payload.dry_run:
        record_stat_action(
            "batch_regenerate_term_segments",
            "term",
            search_term,
            metadata={"replacement": taigi_replacement, "match_jobs": len(matches), "queued_jobs": len(queued_jobs)},
        )
    return {
        "dry_run": payload.dry_run,
        "search_term": search_term,
        "taigi_replacement": taigi_replacement,
        "memory": memory_entry,
        "match_count": sum(int(item.get("segment_count") or 0) for item in matches),
        "regeneratable_count": sum(int(item.get("regeneratable_count") or 0) for item in matches),
        "matched_jobs": matches,
        "queued_jobs": queued_jobs,
    }


@app.post("/jobs")
async def create_job(
    payload: CreateJobRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    owner_id = review_user_id(request, response)
    if not PUBLIC_ACCESS and not admin_or_token:
        require_auth(request, taigi_web_token_cookie, authorization)
    if not payload.chinese_text.strip():
        raise HTTPException(
            status_code=400,
            detail={"message": "請先輸入中文稿，空白內容不能建立工作。"},
        )
    if not admin_or_token and not is_private_client(request) and not is_authenticated(request):
        enforce_public_rate_limit(request, payload.chinese_text)
        payload = payload.model_copy(update={"copy_to_onedrive": False})
    job_id = uuid.uuid4().hex
    payload_title = payload.title.strip()
    display_title = title_from_text(payload.chinese_text) if payload_title in {"", "台語語音影片"} else payload_title
    job = Job(
        id=job_id,
        owner_id=owner_id,
        title=display_title or "台語語音影片",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=time.time(),
        updated_at=time.time(),
        chinese_text=payload.chinese_text,
        metadata={"create_payload": payload.model_dump()},
    )
    app_data["jobs"].add(job)
    record_stat_action("create_job", "job", job_id)
    enqueue_job(0 if is_private_client(request) or admin_or_token else 10, job_id, payload)
    return present_job(job, admin_or_token, owner_id)


@app.get("/jobs")
async def list_jobs(
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    jobs = app_data["jobs"].list()
    if not admin_or_token:
        jobs = [job for job in jobs if job_is_public(job) or job_is_owned_by_request(job, request)]
        jobs = sorted(
            jobs,
            key=job_sort_score,
            reverse=True,
        )
    user_id = review_user_id(request)
    return {"jobs": [present_job(job, admin_or_token, user_id) for job in jobs]}


@app.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    return present_job(job, is_authorized(request, taigi_web_token_cookie, authorization), review_user_id(request, response))


@app.get("/jobs/{job_id}/segments")
async def get_job_segments(
    job_id: str,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    job = source_job_for_segment_regeneration(requested_job)
    payload = ensure_job_segments_payload(job)
    if not payload:
        return {"segments": [], "reviews": []}
    reviews = load_reviews(job)
    user_id = review_user_id(request, response)
    word_db = load_word_db()
    segments = payload.get("segments", [])
    for segment in segments:
        segment_index = int(segment.get("index") or 0)
        stats = segment_review_stats(reviews, int(segment.get("index") or 0), user_id)
        segment.update(stats)
        segment["rating"] = stats["my_rating"]
        segment["feedback_count"] = stats["rating_count"]
        review_statuses = token_review_statuses(reviews, segment_index, user_id)
        tokens = segment_token_entries(str(segment.get("source_text") or ""), word_db)
        for token in tokens:
            token["review_status"] = review_statuses.get(str(token.get("source") or ""), "")
        segment["source_tokens"] = tokens
        analysis = latest_audio_review_for_segment(job, segment_index)
        if analysis:
            segment["audio_review"] = analysis
    return {"segments": segments, "reviews": reviews}


def persist_segment_feedback(job: Job, segment_index: int, feedback: SegmentFeedback, user_id: str) -> tuple[dict, dict]:
    payload = ensure_job_segments_payload(job)
    if not payload:
        raise HTTPException(status_code=404, detail="Segments not found")
    segments_path = output_dir_for_job(job) / "segments.json"

    reviews = load_reviews(job)
    now = time.time()
    review = {
        "segment_index": segment_index,
        "user_id": user_id,
        "rating": feedback.rating,
        "note": feedback.note,
        "corrected_taigi_text": feedback.corrected_taigi_text,
        "corrected_tailo_text": feedback.corrected_tailo_text,
        "corrections": [item.model_dump() for item in feedback.corrections],
        "updated_at": now,
    }
    replaced = False
    for index, existing in enumerate(reviews):
        if existing.get("segment_index") == segment_index and existing.get("user_id") == user_id:
            review["created_at"] = existing.get("created_at", now)
            reviews[index] = review
            replaced = True
            break
    if not replaced:
        review["created_at"] = now
        reviews.append(review)
    save_reviews(job, reviews)
    stats = segment_review_stats(reviews, segment_index, user_id)

    segments_payload = load_state_json_file(segments_path, payload)
    matched = False
    for segment in segments_payload.get("segments", []):
        if int(segment.get("index") or 0) == segment_index:
            matched = True
            segment["rating"] = stats["my_rating"]
            segment["my_rating"] = stats["my_rating"]
            segment["average_rating"] = stats["average_rating"]
            segment["rating_count"] = stats["rating_count"]
            segment["feedback_count"] = stats["rating_count"]
            if feedback.corrected_taigi_text.strip():
                segment["corrected_taigi_text"] = feedback.corrected_taigi_text.strip()
            if feedback.corrected_tailo_text.strip():
                segment["corrected_tailo_text"] = feedback.corrected_tailo_text.strip()
            break
    if not matched:
        raise HTTPException(status_code=404, detail={"message": "找不到這個分段。"})
    save_state_json_file(segments_path, segments_payload)
    remember_feedback(job.id, segment_index, feedback)
    return review, stats


@app.post("/jobs/{job_id}/rating")
async def save_job_rating(
    job_id: str,
    rating: JobRatingRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if rating.rating < 1 or rating.rating > 5:
        raise HTTPException(status_code=400, detail={"message": "評分必須介於 1 到 5。"})
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以評分。"})
    user_id = review_user_id(request, response)
    reviews = load_reviews(job)
    now = time.time()
    review = {
        "target": "job",
        "segment_index": 0,
        "user_id": user_id,
        "rating": rating.rating,
        "note": rating.note,
        "corrected_taigi_text": "",
        "corrected_tailo_text": "",
        "corrections": [],
        "updated_at": now,
    }
    replaced = False
    for index, existing in enumerate(reviews):
        if (existing.get("target") == "job" or existing.get("segment_index") == 0) and existing.get("user_id") == user_id:
            review["created_at"] = existing.get("created_at", now)
            reviews[index] = review
            replaced = True
            break
    if not replaced:
        review["created_at"] = now
        reviews.append(review)
    save_reviews(job, reviews)
    record_stat_action("rate_job", "job", job_id)
    return {"saved": True, "review": review, "stats": job_rating_summary(job, user_id)}


@app.post("/jobs/{job_id}/issue")
async def save_job_issue(
    job_id: str,
    payload: JobIssueRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以標示成果狀態。"})
    user_id = review_user_id(request, response)
    reason = payload.reason.strip()
    if payload.status == "problem":
        issue_type = payload.issue_type.strip()
        updated = app_data["jobs"].update(
            job_id,
            problem=True,
            problem_type=issue_type,
            problem_reason=reason or "使用者標示這個工作成果有問題。",
            problem_reported_at=time.time(),
            problem_reported_by=user_id,
        )
        record_stat_action("report_job_issue", "job", job_id, metadata={"issue_type": issue_type})
    else:
        updated = app_data["jobs"].update(
            job_id,
            problem=False,
            problem_type="",
            problem_reason=reason,
            problem_reported_at=time.time(),
            problem_reported_by=user_id,
        )
        record_stat_action("mark_job_ok", "job", job_id)
    return {"saved": True, "job": present_job(updated, is_authorized(request, taigi_web_token_cookie, authorization), user_id)}


@app.post("/jobs/{job_id}/featured")
async def set_job_featured(
    job_id: str,
    payload: JobFeaturedRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    job = app_data["jobs"].get(job_id)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以設為首頁精選。"})
    user_id = review_user_id(request, response)
    updated = app_data["jobs"].update(
        job_id,
        featured_at=time.time() if payload.featured else None,
        featured_by=user_id if payload.featured else "",
        featured_note=payload.note.strip() if payload.featured else "",
    )
    record_stat_action("feature_job" if payload.featured else "unfeature_job", "job", job_id)
    return {"saved": True, "job": present_job(updated, is_authorized(request, taigi_web_token_cookie, authorization), user_id)}


@app.post("/jobs/{job_id}/segments/{segment_index}/feedback")
async def save_segment_feedback(
    job_id: str,
    segment_index: int,
    feedback: SegmentFeedback,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if feedback.rating < 1 or feedback.rating > 5:
        has_feedback = (
            feedback.note.strip()
            or feedback.corrected_taigi_text.strip()
            or feedback.corrected_tailo_text.strip()
            or any(
                item.source_phrase.strip()
                or item.taigi_correction.strip()
                or item.tailo_correction.strip()
                or item.note.strip()
                or item.status
                for item in feedback.corrections
            )
        )
        if feedback.rating != 0 or not has_feedback:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    job = source_job_for_segment_regeneration(requested_job)
    user_id = review_user_id(request, response)
    review, stats = persist_segment_feedback(job, segment_index, feedback, user_id)
    record_stat_action("rate_segment", "segment", f"{job.id}:{segment_index}")
    return {"saved": True, "review": review, "stats": stats}


@app.post("/jobs/{job_id}/segments/{segment_index}/regenerate")
async def regenerate_segment_audio(
    job_id: str,
    segment_index: int,
    payload: SegmentRegenerateRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    if payload.rating and (payload.rating < 1 or payload.rating > 5):
        raise HTTPException(status_code=400, detail={"message": "評分必須介於 1 到 5。"})
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    job = source_job_for_segment_regeneration(requested_job)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以重生指定分段。"})

    segments_payload = ensure_job_segments_payload(job)
    if not segments_payload:
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料，而且自動修復失敗。"})
    target = next((segment for segment in segments_payload.get("segments", []) if int(segment.get("index") or 0) == segment_index), None)
    if not target:
        raise HTTPException(status_code=404, detail={"message": "找不到這個分段。"})

    user_id = review_user_id(request, response)
    if payload.rating:
        feedback = SegmentFeedback(
            rating=payload.rating,
            note=payload.note,
            corrected_taigi_text=payload.corrected_taigi_text,
            corrected_tailo_text=payload.corrected_tailo_text,
            corrections=payload.corrections,
        )
        persist_segment_feedback(job, segment_index, feedback, user_id)
        segments_payload = ensure_job_segments_payload(job)
        target = next(segment for segment in segments_payload.get("segments", []) if int(segment.get("index") or 0) == segment_index)

    replacement = segment_replacement_from_texts(
        target,
        payload.corrected_taigi_text,
        payload.corrected_tailo_text,
        payload.synthesis_source,
    )
    if not replacement["synthesis_text"]:
        raise HTTPException(status_code=400, detail={"message": "請先提供修正後台語文字或修正後台羅，才能重新產生這段語音。"})

    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    regeneration_job = enqueue_segment_regeneration_job(
        job,
        user_id,
        {segment_index: replacement},
        0 if is_private_client(request) or admin_or_token else 10,
    )
    record_stat_action("queue_regenerate_segment", "segment", f"{job.id}:{segment_index}", metadata={"job_id": regeneration_job.id})
    return {
        "queued": True,
        "job": present_job(regeneration_job, admin_or_token, user_id),
        "source_job": present_job(job, admin_or_token, user_id),
        "segment_index": segment_index,
    }


@app.post("/jobs/{job_id}/segments/regenerate-reviewed")
async def regenerate_reviewed_segments(
    job_id: str,
    payload: SegmentBatchRegenerateRequest,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    job = source_job_for_segment_regeneration(requested_job)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以批次重生分段。"})

    segments_payload = ensure_job_segments_payload(job)
    if not segments_payload:
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料，而且自動修復失敗。"})
    segment_by_index = {
        int(segment.get("index") or 0): segment
        for segment in segments_payload.get("segments", [])
    }

    replacements: dict[int, dict[str, str]] = {}
    for review in sorted(load_reviews(job), key=lambda item: item.get("updated_at") or item.get("created_at") or 0):
        idx = int(review.get("segment_index") or 0)
        if idx <= 0 or idx not in segment_by_index:
            continue
        corrected_taigi = str(review.get("corrected_taigi_text") or "").strip()
        corrected_tailo = str(review.get("corrected_tailo_text") or "").strip()
        if payload.only_with_corrections and not (corrected_taigi or corrected_tailo):
            continue
        segment = segment_by_index[idx]
        replacement = segment_replacement_from_texts(segment, corrected_taigi, corrected_tailo)
        if replacement["synthesis_text"]:
            replacements[idx] = replacement

    if not replacements:
        raise HTTPException(status_code=400, detail={"message": "目前沒有已儲存回饋的分段可重新產生。"})

    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    user_id = review_user_id(request)
    regeneration_job = enqueue_segment_regeneration_job(
        job,
        user_id,
        replacements,
        0 if is_private_client(request) or admin_or_token else 10,
    )
    record_stat_action(
        "queue_regenerate_reviewed_segments",
        "job",
        job.id,
        metadata={"segment_count": len(replacements), "job_id": regeneration_job.id},
    )
    return {
        "queued": True,
        "segment_count": len(replacements),
        "job": present_job(regeneration_job, admin_or_token, user_id),
        "source_job": present_job(job, admin_or_token, user_id),
    }


@app.post("/jobs/{job_id}/regenerate")
async def regenerate_job_from_corrections(
    job_id: str,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    source_job = source_job_for_segment_regeneration(requested_job)
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    owner_id = review_user_id(request, response)
    if source_job.kind == "word_asset":
        word_id = str(source_job.metadata.get("word_id") or "")
        if not word_id:
            raise HTTPException(status_code=400, detail={"message": "這筆詞語語音工作缺少詞語資訊，無法重新產生。"})
        word, word_job = enqueue_word_generation_job(
            word_id,
            owner_id,
            reviewer_display_name(owner_id),
            priority=0 if is_private_client(request) or admin_or_token else 10,
        )
        record_stat_action(
            "regenerate_word_asset_from_job",
            "word",
            word_id,
            metadata={"source_job_id": source_job.id, "job_id": word_job.id if word_job else ""},
        )
        if word_job:
            return present_job(word_job, admin_or_token, owner_id)
        raise HTTPException(status_code=409, detail={"message": word.get("generation_stage") or "這個詞語語音已在佇列中。"})
    segments_payload = ensure_job_segments_payload(source_job)
    if not segments_payload:
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料，而且自動修復失敗，無法用修正稿重新生成。"})
    segments = segments_payload.get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail={"message": "這個工作沒有可重新生成的分段。"})

    chinese_text = "\n".join(str(segment.get("source_text") or "").strip() for segment in segments).strip()
    taigi_override = "\n".join(
        str(segment.get("corrected_taigi_text") or segment.get("taigi_text") or "").strip()
        for segment in segments
    ).strip()
    if not taigi_override:
        raise HTTPException(status_code=400, detail={"message": "沒有台語文字或修正後台語文字可用來重新生成。"})

    if not admin_or_token and not is_private_client(request):
        enforce_public_rate_limit(request, chinese_text)
    settings = load_settings()
    payload = CreateJobRequest(
        title=f"{source_job.title} 修正版",
        chinese_text=chinese_text,
        taigi_override=taigi_override,
        reference_voice_mode=settings.default_reference_voice_mode,
        control="default_male",
        device=DEFAULT_DEVICE,
        inference_timesteps=10,
        cfg_value=2.5,
        max_chars_per_segment=90,
        make_video=True,
        copy_to_onedrive=DEFAULT_COPY_TO_ONEDRIVE if admin_or_token or is_private_client(request) else False,
    )
    new_job_id = uuid.uuid4().hex
    new_job = Job(
        id=new_job_id,
        owner_id=owner_id,
        title=payload.title,
        status="queued",
        stage="Queued",
        progress=0,
        created_at=time.time(),
        updated_at=time.time(),
        chinese_text=payload.chinese_text,
        metadata={"create_payload": payload.model_dump(), "source_job_id": source_job.id},
    )
    app_data["jobs"].add(new_job)
    record_stat_action("regenerate_job", "job", new_job_id)
    enqueue_job(0 if is_private_client(request) or admin_or_token else 10, new_job_id, payload)
    return present_job(new_job, admin_or_token, owner_id)


@app.post("/jobs/{job_id}/regenerate-full")
async def regenerate_full_job(
    job_id: str,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    require_auth(request, taigi_web_token_cookie, authorization)
    requested_job = app_data["jobs"].get(job_id)
    if not requested_job:
        raise HTTPException(status_code=404, detail={"message": "找不到這個工作。"})
    source_job = source_job_for_segment_regeneration(requested_job)
    owner_id = review_user_id(request, response)
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    new_job = queue_full_script_regeneration(source_job, owner_id, admin_or_token)
    return present_job(new_job, admin_or_token, owner_id)


@app.post("/jobs/{job_id}/audio-review")
async def queue_audio_review(
    job_id: str,
    payload: AudioReviewRequest,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    source_job = source_job_for_segment_regeneration(requested_job)
    if source_job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以做音訊校對。"})
    if source_job.kind not in {"script", "segment_regeneration"}:
        raise HTTPException(status_code=400, detail={"message": "目前只支援整段稿件與重生分段的音訊校對。"})
    if not ensure_job_segments_payload(source_job):
        raise HTTPException(status_code=404, detail={"message": "找不到可校對的分段資料。"})
    owner_id = review_user_id(request)
    now = time.time()
    review_job = Job(
        id=uuid.uuid4().hex,
        kind="audio_review",
        owner_id=owner_id,
        title=f"音訊校對：{source_job.title}",
        status="queued",
        stage="Queued",
        progress=0,
        created_at=now,
        updated_at=now,
        chinese_text=source_job.chinese_text,
        taigi_text=source_job.taigi_text,
        tailo_text=source_job.tailo_text,
        segment_count=source_job.segment_count,
        metadata={
            "source_job_id": source_job.id,
            "run_asr": payload.run_asr,
            "generate_mms": payload.generate_mms,
            "breeze_asr_model": BREEZE_ASR_MODEL,
            "mms_tts_model": MMS_TTS_MODEL,
        },
    )
    app_data["jobs"].add(review_job)
    enqueue_job(20 if is_private_client(request) or is_authorized(request, taigi_web_token_cookie, authorization) else 40, review_job.id, None)
    record_stat_action("queue_audio_review", "job", source_job.id, metadata={"job_id": review_job.id, "generate_mms": payload.generate_mms})
    return {
        "queued": True,
        "job": present_job(review_job, is_authorized(request, taigi_web_token_cookie, authorization), owner_id),
        "source_job": present_job(source_job, is_authorized(request, taigi_web_token_cookie, authorization), owner_id),
    }


@app.get("/jobs/{job_id}/audio-review")
async def get_audio_review(
    job_id: str,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    requested_job = app_data["jobs"].get(job_id)
    require_job_access(requested_job, request, taigi_web_token_cookie, authorization)
    job = source_job_for_segment_regeneration(requested_job)
    return latest_audio_review_payload(job) or {"segments": [], "summary": {}, "providers": {}}


@app.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    payload: RetryJobRequest,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    if payload.mode == "resume":
        # The current pipelines overwrite their final outputs safely, but do not yet
        # persist a resumable step cursor. Treat resume as a queued restart.
        mode = "resume_as_restart"
    else:
        mode = "restart"
    updated, _ = enqueue_retry_job(job, 0 if is_private_client(request) or admin_or_token else 10)
    record_stat_action("retry_job", "job", job_id, metadata={"kind": job.kind, "mode": mode})
    return present_job(updated, admin_or_token, review_user_id(request, response))


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
    if kind == "audio":
        increment_play("audio", "job", job_id)
    elif kind == "video":
        increment_play("video", "job", job_id)
    return FileResponse(path, headers={"Content-Disposition": content_disposition(job_download_filename(job, kind, path))})


@app.get("/jobs/{job_id}/media/{kind}")
async def media_job_file(
    job_id: str,
    kind: Literal["audio", "video"],
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail="Job is not complete")
    path = Path((job.audio_path if kind == "audio" else job.video_path) or "")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Output file not found")
    media_type = "audio/wav" if kind == "audio" else "video/mp4"
    increment_play(kind, "job", job_id)
    return FileResponse(path, media_type=media_type)


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
    increment_play("audio", "segment", f"{segment_index}", job_id=job_id)
    filename = segment_download_filename(job, segment_index, output_dir, path)
    return FileResponse(path, media_type="audio/wav", headers={"Content-Disposition": content_disposition(filename)})
