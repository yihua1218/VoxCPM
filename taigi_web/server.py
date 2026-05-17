import asyncio
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
import urllib.error
import urllib.request
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

from fastapi import Cookie, FastAPI, Form, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
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
STATS_PATH = Path(os.environ.get("TAIGI_WEB_STATS", JOB_ROOT / "stats.json"))
SQLITE_DB = Path(os.environ.get("TAIGI_WEB_SQLITE_DB", JOB_ROOT / "taigi_web.sqlite3"))
PUBLIC_STATIC_DIR = Path(os.environ.get("TAIGI_WEB_PUBLIC_STATIC_DIR", JOB_ROOT / "public_static"))
PUBLIC_STATIC_URL = os.environ.get("TAIGI_WEB_PUBLIC_STATIC_URL", "/static-data").rstrip("/")
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
RATE_LIMIT_SECONDS = int(os.environ.get("TAIGI_WEB_PUBLIC_JOB_INTERVAL_SECONDS", "600"))
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


class MagicLinkRequest(BaseModel):
    email: str


class VerifyMagicLinkRequest(BaseModel):
    token: str


class AnonymousNicknameRequest(BaseModel):
    nickname: str


class AppSettings(BaseModel):
    default_reference_voice_mode: Literal["default", "random"] = "default"
    public_rate_limit_seconds: int = RATE_LIMIT_SECONDS
    api_access_token: str = ""
    postgres_dsn: str = POSTGRES_DSN
    postgres_schema: str = POSTGRES_SCHEMA
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
    kind: Literal["script", "word_asset"] = "script"
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
    metadata: dict = Field(default_factory=dict)


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


class SegmentRegenerateRequest(BaseModel):
    rating: int = 0
    note: str = ""
    corrected_taigi_text: str = ""
    corrected_tailo_text: str = ""
    corrections: list[SegmentCorrection] = []


class SegmentBatchRegenerateRequest(BaseModel):
    only_with_corrections: bool = False


class WordIssueRequest(BaseModel):
    reason: str = ""


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


class WordTranslationRequest(BaseModel):
    languages: list[str] = []
    overwrite: bool = False


class SourceExportRequest(BaseModel):
    languages: list[str] = []
    format: Literal["json", "sqlite", "csv"] = "json"
    note: str = ""


class JobRatingRequest(BaseModel):
    rating: int
    note: str = ""


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
        path.write_text(job.model_dump_json(indent=2), encoding="utf-8")
        if job.status in {"complete", "failed"}:
            schedule_public_snapshot_export()

    def load(self):
        with self._lock:
            self._jobs.clear()
            for job in db_load_jobs():
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
            for job_path in JOB_ROOT.glob("*/job.json"):
                try:
                    job = Job.model_validate_json(job_path.read_text(encoding="utf-8"))
                    if job.id in self._jobs:
                        continue
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


def db_set_json(key: str, value):
    with db_lock, db_connect() as conn:
        conn.execute(
            "INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, json.dumps(value, ensure_ascii=False), time.time()),
        )
        conn.commit()


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
    with db_lock, db_connect() as conn:
        conn.execute(
            "INSERT INTO jobs(id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (job.id, job.model_dump_json(), time.time()),
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
) -> tuple[dict, Optional[Job]]:
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    if word.get("generation_status") in {"queued", "running"} or word_has_active_generation(word_id):
        active_job_id = word.get("generation_job_id", "")
        active_job = app_data["jobs"].get(active_job_id) if active_job_id else None
        return {**word, **word_generation_status(word)}, active_job
    now = time.time()
    job_id = uuid.uuid4().hex
    requester_name = requester_name or reviewer_display_name(requester_id) or "匿名使用者"
    word.update({
        "generation_status": "queued",
        "generation_stage": "已排入主工作佇列",
        "generation_progress": 5,
        "generation_error": "",
        "generation_job_id": job_id,
        "generation_requester_id": requester_id,
        "generation_requester_name": requester_name,
        "generation_auto": auto,
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
        if not word_has_generated_asset(word)
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
            "generation_updated_at": time.time(),
            "updated_at": time.time(),
        })
        db = load_word_db()
        db.setdefault("words", {})[word_id] = generated
        save_word_db(db)
        completed_at = time.time()
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
            taigi_text=generated.get("taigi", ""),
            tailo_text=generated.get("tailo", ""),
            metadata={**job.metadata, "asset_id": asset.get("id")},
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


def job_worker():
    while True:
        _, _, job_id, payload = job_queue.get()
        try:
            job = app_data["jobs"].get(job_id)
            if job and job.kind == "word_asset":
                run_word_asset_job(job_id)
            elif payload:
                run_job(job_id, payload)
        finally:
            job_queue.task_done()


worker_thread = Thread(target=job_worker, daemon=True)
word_auto_scheduler_thread = Thread(target=word_auto_scheduler, daemon=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    JOB_ROOT.mkdir(parents=True, exist_ok=True)
    app_data["jobs"].load()
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
        stored = db_get_json("auth_store", None)
        if stored is not None:
            stored.setdefault("magic_tokens", {})
            stored.setdefault("sessions", {})
            stored.setdefault("users", {})
            stored.setdefault("anonymous_users", {})
            return stored
        if not AUTH_STORE.exists():
            payload = {"magic_tokens": {}, "sessions": {}, "users": {}, "anonymous_users": {}}
            db_set_json("auth_store", payload)
            return payload
        try:
            payload = json.loads(AUTH_STORE.read_text(encoding="utf-8"))
        except Exception:
            payload = {"magic_tokens": {}, "sessions": {}, "users": {}, "anonymous_users": {}}
            db_set_json("auth_store", payload)
            return payload
        payload.setdefault("magic_tokens", {})
        payload.setdefault("sessions", {})
        payload.setdefault("users", {})
        payload.setdefault("anonymous_users", {})
        db_set_json("auth_store", payload)
        return payload


def load_settings() -> AppSettings:
    stored = db_get_json("settings", None)
    if stored is not None:
        try:
            return AppSettings.model_validate(stored)
        except Exception:
            return AppSettings()
    if not SETTINGS_PATH.exists():
        settings = AppSettings()
        db_set_json("settings", settings.model_dump())
        return settings


RANDOM_SENTENCE_FALLBACKS = [
    "今天下午想聽一段輕鬆的生活新聞，內容可以聊人工智慧、台灣科技，還有週末適合做的事情。",
    "早安，今天想用台語聽一則短短的重點整理，主題是半導體產業、AI 工具，以及一般人可以怎麼應用。",
    "午安啊，今天在家裡想練習一句台語，先從簡單的日常問候開始，再慢慢學會介紹自己的生活。",
    "我想做一支給自己聽的台語語音影片，內容介紹今天最值得注意的科技新聞和生活小提醒。",
    "晚上散步的時候，我想聽一段台語短文，講一講珍珠奶茶、夜市小吃，以及台灣日常生活的趣味。",
]


def clean_generated_sentence(text: str) -> str:
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
    try:
        settings = AppSettings.model_validate_json(SETTINGS_PATH.read_text(encoding="utf-8"))
        db_set_json("settings", settings.model_dump())
        return settings
    except Exception:
        settings = AppSettings()
        db_set_json("settings", settings.model_dump())
        return settings


def save_settings(settings: AppSettings):
    db_set_json("settings", settings.model_dump())
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(settings.model_dump_json(indent=2), encoding="utf-8")


def save_auth_store(payload: dict):
    with auth_lock:
        db_set_json("auth_store", payload)
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
        "sentence_limit": 1,
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
    if sentence_count(text) > 1:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "未登入使用者每次只能送出一句。",
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


def authenticated_email(request: Request) -> Optional[str]:
    session = request.cookies.get(ADMIN_SESSION_COOKIE)
    return session_email(session) if session else None


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


def load_reviews(job: Job) -> list[dict]:
    reviews_path = reviews_path_for_job(job)
    if not reviews_path.exists():
        return []
    try:
        return json.loads(reviews_path.read_text(encoding="utf-8")).get("reviews", [])
    except Exception:
        return []


def save_reviews(job: Job, reviews: list[dict]):
    reviews_path = reviews_path_for_job(job)
    reviews_path.parent.mkdir(parents=True, exist_ok=True)
    reviews_path.write_text(json.dumps({"reviews": reviews}, ensure_ascii=False, indent=2), encoding="utf-8")


def load_stats() -> dict:
    with stats_lock:
        stored = db_get_json("stats", None)
        if stored is not None:
            stored.setdefault("jobs", {})
            stored.setdefault("words", {})
            stored.setdefault("actions", {})
            stored.setdefault("daily", {})
            stored.setdefault("total_plays", 0)
            stored.setdefault("audio_plays", 0)
            stored.setdefault("video_plays", 0)
            return stored
        if not STATS_PATH.exists():
            payload = {
                "total_plays": 0,
                "audio_plays": 0,
                "video_plays": 0,
                "jobs": {},
                "words": {},
                "actions": {},
                "daily": {},
                "updated_at": 0,
            }
            db_set_json("stats", payload)
            return payload
        try:
            payload = json.loads(STATS_PATH.read_text(encoding="utf-8"))
        except Exception:
            payload = {
                "total_plays": 0,
                "audio_plays": 0,
                "video_plays": 0,
                "jobs": {},
                "words": {},
                "actions": {},
                "daily": {},
                "updated_at": 0,
            }
            db_set_json("stats", payload)
            return payload
        payload.setdefault("jobs", {})
        payload.setdefault("words", {})
        payload.setdefault("actions", {})
        payload.setdefault("daily", {})
        payload.setdefault("total_plays", 0)
        payload.setdefault("audio_plays", 0)
        payload.setdefault("video_plays", 0)
        db_set_json("stats", payload)
        return payload


def save_stats(payload: dict):
    with stats_lock:
        STATS_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload["updated_at"] = time.time()
        db_set_json("stats", payload)
        STATS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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
    return (rating, plays, job.updated_at)


def present_job(job: Job, admin: bool, user_id: str = ""):
    if admin:
        payload = job.model_dump()
    else:
        payload = job.model_dump()
        for key in ("owner_id", "output_dir", "audio_path", "zip_path", "onedrive_dir"):
            payload.pop(key, None)
        payload["video_path"] = "available" if job.video_path else None
        if isinstance(payload.get("metadata"), dict):
            payload["metadata"] = {
                key: value
                for key, value in payload["metadata"].items()
                if key not in {"requester_id"}
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


def content_disposition(filename: str) -> str:
    encoded = quote(filename, safe="")
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-") or "download"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


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
        "problem_reason": word.get("problem_reason", ""),
        "has_audio": bool(word.get("has_audio")),
        "has_video": bool(word.get("has_video")),
        "assets": public_word_assets(word, user_id),
        "multilingual": word.get("multilingual", {}),
        "multilingual_request_count": len(word.get("multilingual_requests") or []),
        **generation,
        "updated_at": word.get("updated_at"),
        "generated_at": word.get("generated_at"),
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
        "title": "Source and License Governance Ledger",
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
            {"name": "MOE Taiwanese Taigi dictionary", "license": "pending review", "status": "confirm_before_import", "links": ["https://sutian.moe.edu.tw/"]},
            {"name": "ChhoeTaigi / iTaigi community resources", "license": "dataset-level review required", "status": "confirm_before_import", "links": ["https://chhoe.taigi.info/", "https://itaigi.tw/", "https://github.com/ChhoeTaigi/ChhoeTaigiDatabase"]},
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
    words = list(word_db.get("words", {}).values())
    completed_jobs = [job for job in jobs if job.status == "complete"]
    inventory = file_inventory()
    word_entries_rated = sum(1 for word in words if int(word_rating_summary(word).get("rating_count") or 0) > 0)
    word_assets = [asset for word in words for asset in public_word_assets(word)]
    word_assets_total = len(word_assets)
    word_assets_rated = sum(1 for asset in word_assets if int(asset.get("rating_count") or 0) > 0)
    word_assets_problem = sum(1 for word in words if word.get("problem"))
    word_asset_jobs = [job for job in jobs if job.kind == "word_asset"]
    actions = stats.get("actions", {})
    source_exports = source_export_summary()
    lexicon_quality = {
        "word_entries_total": len(words),
        "word_entries_rated": word_entries_rated,
        "word_entries_unrated": max(0, len(words) - word_entries_rated),
        "word_assets_total": word_assets_total,
        "word_assets_rated": word_assets_rated,
        "word_assets_unrated": max(0, word_assets_total - word_assets_rated),
        "word_problem_count": word_assets_problem,
        "word_problem_rate": round(word_assets_problem / len(words), 4) if words else 0,
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
        "source_exports": source_exports,
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
        stored = db_get_json("translation_memory", None)
        if stored is not None:
            stored.setdefault("terms", {})
            stored.setdefault("feedback", [])
            return stored
        if not TRANSLATION_MEMORY.exists():
            payload = {"terms": {}, "feedback": []}
            db_set_json("translation_memory", payload)
            return payload
        try:
            payload = json.loads(TRANSLATION_MEMORY.read_text(encoding="utf-8"))
        except Exception:
            payload = {"terms": {}, "feedback": []}
            db_set_json("translation_memory", payload)
            return payload
        payload.setdefault("terms", {})
        payload.setdefault("feedback", [])
        db_set_json("translation_memory", payload)
        return payload


def save_translation_memory(payload: dict):
    with memory_lock:
        TRANSLATION_MEMORY.parent.mkdir(parents=True, exist_ok=True)
        payload["updated_at"] = time.time()
        db_set_json("translation_memory", payload)
        TRANSLATION_MEMORY.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def remember_feedback(job_id: str, segment_index: int, feedback: SegmentFeedback):
    memory = load_translation_memory()
    word_db = load_word_db()
    word_db_changed = False
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


def safe_word_id(source: str, taigi: str) -> str:
    digest = sha256(f"{source}\n{taigi}".encode("utf-8")).hexdigest()[:16]
    slug = re.sub(r"[^A-Za-z0-9]+", "-", source).strip("-").lower()[:32] or "word"
    return f"{slug}-{digest}"


def word_kind(source: str) -> str:
    return "phrase" if len(source) >= 4 else "word"


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
        stored = db_get_json("word_db", None)
        if stored is not None:
            stored.setdefault("words", {})
            stored.setdefault("queries", {})
            return seed_fixed_phrases(stored)
        if not WORD_DB.exists():
            payload = seed_fixed_phrases({"words": {}, "queries": {}, "updated_at": 0})
            db_set_json("word_db", payload)
            return payload
        try:
            payload = json.loads(WORD_DB.read_text(encoding="utf-8"))
        except Exception:
            payload = seed_fixed_phrases({"words": {}, "queries": {}, "updated_at": 0})
            db_set_json("word_db", payload)
            return payload
        payload.setdefault("words", {})
        payload.setdefault("queries", {})
        payload = seed_fixed_phrases(payload)
        db_set_json("word_db", payload)
        return payload


def save_word_db(payload: dict):
    with word_db_lock:
        WORD_DB.parent.mkdir(parents=True, exist_ok=True)
        payload["updated_at"] = time.time()
        db_set_json("word_db", payload)
        WORD_DB.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
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
    if not source or not taigi_text:
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
    words = []
    for word in raw_words:
        word = word.strip()
        if not word or re.fullmatch(r"[，。！？、；：,.!?;:「」『』（）()]+", word):
            continue
        words.append(word)
    return words


def generate_word_video(word_dir: Path, title: str, audio_path: Path) -> Path:
    return make_video(
        word_dir,
        title,
        audio_path,
        [{"index": 1, "start": 0.0, "end": max(0.2, duration(audio_path)), "text": title}],
    )


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

    reference_audio: Optional[Path] = None
    if voice_mode == "default":
        reference_audio = DEFAULT_REFERENCE_AUDIO.expanduser()
    cmd = [
        VOXCPM_BIN, "clone" if reference_audio else "design",
        "--text", word["taigi"],
        "--control", voice_control,
        "--output", str(audio_path),
        "--device", device,
        "--cache-dir", str(CACHE_DIR),
        "--no-denoiser",
        "--local-files-only",
        "--inference-timesteps", str(max(4, min(timesteps, 10))),
        "--cfg-value", str(cfg_value),
    ]
    if reference_audio and reference_audio.exists():
        cmd.extend(["--reference-audio", str(reference_audio)])
    run(cmd)
    generated_video = generate_word_video(word_dir, word["taigi"], audio_path)
    if generated_video != video_path:
        shutil.move(generated_video, video_path)
    return {
        **word,
        "audio_path": str(audio_path),
        "video_path": str(video_path),
        "has_audio": audio_path.exists(),
        "has_video": video_path.exists(),
        "problem": False,
        "problem_reason": "",
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
    if not assets and word.get("audio_path"):
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
    stats_words = load_stats().get("words", {})
    asset_stats = stats_words.get(word.get("id", ""), {}).get("assets", {})
    public_assets = []
    for asset in assets:
        asset_id = asset.get("id")
        ratings = word_asset_rating_summary(asset, user_id)
        public_assets.append({
            "id": asset_id,
            "has_audio": bool(asset.get("has_audio")),
            "has_video": bool(asset.get("has_video")),
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
    reference_audio: Optional[Path] = None
    if voice_mode == "default":
        reference_audio = DEFAULT_REFERENCE_AUDIO.expanduser()
    cmd = [
        VOXCPM_BIN, "clone" if reference_audio else "design",
        "--text", word["taigi"],
        "--control", voice_control,
        "--output", str(audio_path),
        "--device", device,
        "--cache-dir", str(CACHE_DIR),
        "--no-denoiser",
        "--local-files-only",
        "--inference-timesteps", str(max(4, min(timesteps, 10))),
        "--cfg-value", str(cfg_value),
    ]
    if reference_audio and reference_audio.exists():
        cmd.extend(["--reference-audio", str(reference_audio)])
    run(cmd)
    generated_video = generate_word_video(word_dir, word["taigi"], audio_path)
    if generated_video != video_path:
        shutil.move(generated_video, video_path)
    asset = {
        "id": asset_id,
        "audio_path": str(audio_path),
        "video_path": str(video_path),
        "has_audio": audio_path.exists(),
        "has_video": video_path.exists(),
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
        if len(source_sentence) >= 4:
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
                generate_assets_flag=True,
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


def rebuild_job_outputs(job: Job, segments_payload: dict, *, render_video: bool = True) -> tuple[Path, Optional[Path], Path]:
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
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path.name), "-c", "copy", str(audio_path)], cwd=segments_dir)

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
    (output_dir / "subtitles.json").write_text(json.dumps({"duration": cursor, "segments": timeline}, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "segments.json").write_text(json.dumps({"segments": segments}, ensure_ascii=False, indent=2), encoding="utf-8")

    video_path = make_video(output_dir, job.title, audio_path, timeline) if render_video and job.video_path else None
    zip_path = make_archive(output_dir)
    return audio_path, video_path, zip_path


def regenerate_job_segments_from_texts(job: Job, segments_payload: dict, replacements: dict[int, tuple[str, str]]) -> tuple[list[dict], Path, Optional[Path], Path]:
    output_dir = Path(job.output_dir or JOB_ROOT / job.id / "output")
    segments_dir = output_dir / "segments"
    voice_mode = (output_dir / "voice_mode.txt").read_text(encoding="utf-8").strip() if (output_dir / "voice_mode.txt").exists() else load_settings().default_reference_voice_mode
    voice_control = (output_dir / "voice_control.txt").read_text(encoding="utf-8").strip() if (output_dir / "voice_control.txt").exists() else resolve_voice_control("default_male")
    regenerated = []
    for segment in segments_payload.get("segments", []):
        idx = int(segment.get("index") or 0)
        if idx not in replacements:
            continue
        new_taigi, new_tailo = replacements[idx]
        new_taigi = new_taigi.strip()
        if not new_taigi:
            continue
        new_tailo = new_tailo.strip() or tailo_for(new_taigi)
        wav_path = segments_dir / f"seg_{idx:02d}.wav"
        synthesize_segment_audio(wav_path, new_taigi, voice_mode, voice_control, DEFAULT_DEVICE, 10, 2.5)
        segment["taigi_text"] = new_taigi
        segment["tailo_text"] = new_tailo
        segment["corrected_taigi_text"] = new_taigi
        segment["corrected_tailo_text"] = new_tailo
        segment["regenerated_at"] = time.time()
        segment["audio_file"] = f"segments/{wav_path.name}"
        write_segment_text_files(segments_dir, segment)
        regenerated.append(segment)
    if not regenerated:
        raise ValueError("No segment text available for regeneration.")
    audio_path, video_path, zip_path = rebuild_job_outputs(job, segments_payload, render_video=True)
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
        (output_dir / "subtitles.json").write_text(json.dumps({"duration": cursor, "segments": timeline}, ensure_ascii=False, indent=2), encoding="utf-8")
        (output_dir / "segments.json").write_text(json.dumps({"segments": segment_records}, ensure_ascii=False, indent=2), encoding="utf-8")

        jobs.update(job_id, stage="Updating word database", progress=82)
        update_word_database_for_job(job_id, segment_records, payload, voice_mode, voice_control)

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
    response = JSONResponse({"authenticated": True, "is_admin": email == ADMIN_EMAIL, "email": email})
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
        "pipeline": ["translate", "segment", "tts", "join", "subtitle", "video", "package"],
    }
    if not PUBLIC_ACCESS:
        info["job_dir"] = str(JOB_ROOT)
        info["translation_memory"] = str(TRANSLATION_MEMORY)
    return info


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
        "sentence_limit": 1,
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
    items = list(db.get("words", {}).values())
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
    email = require_email_login(request)
    user_id = f"admin:{email}" if email == ADMIN_EMAIL else f"user:{email}"
    word = create_requested_word_entry(payload, user_id, reviewer_display_name(user_id))
    record_stat_action("request_new_word", "word", word["id"], metadata={"email": email})
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
async def generate_word_asset_endpoint(word_id: str, request: Request, response: Response):
    user_id = review_user_id(request, response)
    word, job = enqueue_word_generation_job(word_id, user_id, reviewer_display_name(user_id))
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


@app.post("/words/{word_id}/issue")
async def report_word_issue(word_id: str, payload: WordIssueRequest):
    db = load_word_db()
    word = db.get("words", {}).get(word_id)
    if not word:
        raise HTTPException(status_code=404, detail={"message": "找不到這個詞語。"})
    word["problem"] = True
    word["problem_reason"] = payload.reason.strip() or "使用者回報詞語素材有問題"
    word["problem_reported_at"] = time.time()
    db["words"][word_id] = word
    save_word_db(db)
    return {"saved": True, "word": {k: word.get(k) for k in ("id", "source", "taigi", "tailo", "problem", "problem_reason")}}


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
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": content_disposition(path.name)})


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
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": content_disposition(path.name)})


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
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    return present_job(job, is_authorized(request, taigi_web_token_cookie, authorization), review_user_id(request))


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
    reviews = load_reviews(job)
    user_id = review_user_id(request)
    segments = payload.get("segments", [])
    for segment in segments:
        stats = segment_review_stats(reviews, int(segment.get("index") or 0), user_id)
        segment.update(stats)
        segment["rating"] = stats["my_rating"]
        segment["feedback_count"] = stats["rating_count"]
    return {"segments": segments, "reviews": reviews}


def persist_segment_feedback(job: Job, segment_index: int, feedback: SegmentFeedback, user_id: str) -> tuple[dict, dict]:
    output_dir = Path(job.output_dir or JOB_ROOT / job.id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        raise HTTPException(status_code=404, detail="Segments not found")

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

    segments_payload = json.loads(segments_path.read_text(encoding="utf-8"))
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
    segments_path.write_text(json.dumps(segments_payload, ensure_ascii=False, indent=2), encoding="utf-8")
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
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    user_id = review_user_id(request, response)
    review, stats = persist_segment_feedback(job, segment_index, feedback, user_id)
    record_stat_action("rate_segment", "segment", f"{job_id}:{segment_index}")
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
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以重生指定分段。"})

    output_dir = Path(job.output_dir or JOB_ROOT / job_id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料。"})
    segments_payload = json.loads(segments_path.read_text(encoding="utf-8"))
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
        segments_payload = json.loads(segments_path.read_text(encoding="utf-8"))
        target = next(segment for segment in segments_payload.get("segments", []) if int(segment.get("index") or 0) == segment_index)

    new_taigi = (payload.corrected_taigi_text or target.get("corrected_taigi_text") or target.get("taigi_text") or "").strip()
    if not new_taigi:
        raise HTTPException(status_code=400, detail={"message": "請先提供修正後台語文字，才能重新產生這段語音。"})
    new_tailo = (payload.corrected_tailo_text or target.get("corrected_tailo_text") or "").strip() or tailo_for(new_taigi)

    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)

    def regenerate_worker():
        previous_stage = job.stage
        previous_progress = job.progress
        app_data["jobs"].update(job_id, stage=f"Regenerating segment {segment_index}", progress=90)
        try:
            regenerated, audio_path, video_path, zip_path = regenerate_job_segments_from_texts(
                job,
                segments_payload,
                {segment_index: (new_taigi, new_tailo)},
            )
            target_segment = regenerated[0]
            updated_job = app_data["jobs"].update(
                job_id,
                stage="Complete",
                progress=100,
                taigi_text="\n".join(str(segment.get("taigi_text") or "") for segment in segments_payload.get("segments", [])),
                tailo_text="\n".join(str(segment.get("tailo_text") or "") for segment in segments_payload.get("segments", [])),
                audio_path=str(audio_path),
                video_path=str(video_path or job.video_path) if (video_path or job.video_path) else None,
                zip_path=str(zip_path),
                error=None,
            )
            record_stat_action("regenerate_segment", "segment", f"{job_id}:{segment_index}")
            schedule_public_snapshot_export()
            return {
                "regenerated": True,
                "job": present_job(updated_job, admin_or_token, user_id),
                "segment": target_segment,
            }
        except Exception as exc:
            app_data["jobs"].update(job_id, stage=previous_stage, progress=previous_progress, error=str(exc))
            raise HTTPException(status_code=500, detail={"message": f"重新產生分段失敗：{exc}"}) from exc

    return await asyncio.to_thread(regenerate_worker)


@app.post("/jobs/{job_id}/segments/regenerate-reviewed")
async def regenerate_reviewed_segments(
    job_id: str,
    payload: SegmentBatchRegenerateRequest,
    request: Request,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    job = app_data["jobs"].get(job_id)
    require_job_access(job, request, taigi_web_token_cookie, authorization)
    if job.status != "complete":
        raise HTTPException(status_code=409, detail={"message": "只有完成的工作可以批次重生分段。"})

    output_dir = Path(job.output_dir or JOB_ROOT / job_id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料。"})
    segments_payload = json.loads(segments_path.read_text(encoding="utf-8"))
    segment_by_index = {
        int(segment.get("index") or 0): segment
        for segment in segments_payload.get("segments", [])
    }

    replacements: dict[int, tuple[str, str]] = {}
    for review in sorted(load_reviews(job), key=lambda item: item.get("updated_at") or item.get("created_at") or 0):
        idx = int(review.get("segment_index") or 0)
        if idx <= 0 or idx not in segment_by_index:
            continue
        corrected_taigi = str(review.get("corrected_taigi_text") or "").strip()
        corrected_tailo = str(review.get("corrected_tailo_text") or "").strip()
        if payload.only_with_corrections and not corrected_taigi:
            continue
        segment = segment_by_index[idx]
        taigi_text = corrected_taigi or str(segment.get("corrected_taigi_text") or segment.get("taigi_text") or "").strip()
        tailo_text = corrected_tailo or str(segment.get("corrected_tailo_text") or segment.get("tailo_text") or "").strip()
        if taigi_text:
            replacements[idx] = (taigi_text, tailo_text)

    if not replacements:
        raise HTTPException(status_code=400, detail={"message": "目前沒有已儲存回饋的分段可重新產生。"})

    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    user_id = review_user_id(request)

    def regenerate_reviewed_worker():
        previous_stage = job.stage
        previous_progress = job.progress
        app_data["jobs"].update(job_id, stage=f"Regenerating {len(replacements)} reviewed segments", progress=88)
        try:
            regenerated, audio_path, video_path, zip_path = regenerate_job_segments_from_texts(job, segments_payload, replacements)
            updated_job = app_data["jobs"].update(
                job_id,
                stage="Complete",
                progress=100,
                taigi_text="\n".join(str(segment.get("taigi_text") or "") for segment in segments_payload.get("segments", [])),
                tailo_text="\n".join(str(segment.get("tailo_text") or "") for segment in segments_payload.get("segments", [])),
                audio_path=str(audio_path),
                video_path=str(video_path or job.video_path) if (video_path or job.video_path) else None,
                zip_path=str(zip_path),
                error=None,
            )
            for segment in regenerated:
                record_stat_action("regenerate_segment", "segment", f"{job_id}:{segment.get('index')}")
            record_stat_action("regenerate_reviewed_segments", "job", job_id, metadata={"segment_count": len(regenerated)})
            schedule_public_snapshot_export()
            return {
                "regenerated": True,
                "segment_count": len(regenerated),
                "segments": regenerated,
                "job": present_job(updated_job, admin_or_token, user_id),
            }
        except Exception as exc:
            app_data["jobs"].update(job_id, stage=previous_stage, progress=previous_progress, error=str(exc))
            raise HTTPException(status_code=500, detail={"message": f"重新產生已回饋分段失敗：{exc}"}) from exc

    return await asyncio.to_thread(regenerate_reviewed_worker)


@app.post("/jobs/{job_id}/regenerate")
async def regenerate_job_from_corrections(
    job_id: str,
    request: Request,
    response: Response,
    taigi_web_token_cookie: Annotated[Optional[str], Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[Optional[str], Header()] = None,
):
    source_job = app_data["jobs"].get(job_id)
    require_job_access(source_job, request, taigi_web_token_cookie, authorization)
    output_dir = Path(source_job.output_dir or JOB_ROOT / job_id / "output")
    segments_path = output_dir / "segments.json"
    if not segments_path.exists():
        raise HTTPException(status_code=404, detail={"message": "找不到分段資料，無法用修正稿重新生成。"})
    segments = json.loads(segments_path.read_text(encoding="utf-8")).get("segments", [])
    if not segments:
        raise HTTPException(status_code=400, detail={"message": "這個工作沒有可重新生成的分段。"})

    chinese_text = "\n".join(str(segment.get("source_text") or "").strip() for segment in segments).strip()
    taigi_override = "\n".join(
        str(segment.get("corrected_taigi_text") or segment.get("taigi_text") or "").strip()
        for segment in segments
    ).strip()
    if not taigi_override:
        raise HTTPException(status_code=400, detail={"message": "沒有台語文字或修正後台語文字可用來重新生成。"})

    admin_or_token = is_authorized(request, taigi_web_token_cookie, authorization)
    owner_id = review_user_id(request, response)
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
    )
    app_data["jobs"].add(new_job)
    record_stat_action("regenerate_job", "job", new_job_id)
    enqueue_job(0 if is_private_client(request) or admin_or_token else 10, new_job_id, payload)
    return present_job(new_job, admin_or_token, owner_id)


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
    increment_play("audio", "segment", f"{segment_index}", job_id=job_id)
    return FileResponse(path, media_type="audio/wav", headers={"Content-Disposition": content_disposition(path.name)})
