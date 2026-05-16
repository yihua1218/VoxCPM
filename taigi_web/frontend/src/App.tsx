import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  ConfigProvider,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Progress,
  Rate,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  AudioOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LinkOutlined,
  LockOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import axios from 'axios';

axios.defaults.timeout = 30000;

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type UiLanguage = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'ko' | 'taigi' | 'tailo';

const UI_LANGUAGES: Array<{ value: UiLanguage; label: string }> = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'taigi', label: '台語' },
  { value: 'tailo', label: 'Tâi-lô' },
];

const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = Object.fromEntries(
  UI_LANGUAGES.map((item) => [item.value, item.label]),
) as Record<UiLanguage, string>;

const UI_TEXT: Record<UiLanguage, Record<string, string>> = {
  'zh-Hant': {
    subtitle: '中文稿 → 台語稿 → 語音 → 字幕波形影片',
    work: '工作',
    jobs: '工作總覽',
    lexicon: '語詞資料庫',
    stats: '統計趨勢',
    sources: '來源授權',
    refresh: '重新整理',
    signOut: '登出',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: '建立台語語音影片工作',
    createHelp: '輸入中文稿後，系統會先產生台語草稿與台羅輔助稿，再分段生成語音並輸出字幕影片。台語草稿欄可直接覆寫，適合人工校稿後再送出。',
    jobKindScript: '稿件影片',
    jobKindWord: '詞語語音',
    rateAudio: '語音評分',
    generateWord: '產生新的語音版本',
    regenerateWord: '申請重新產生語音',
    reportIssue: '回報素材有問題',
    overviewTitle: '系統概覽',
    overviewHelp: '公開累計使用狀況',
    statsTitle: '統計',
    statsDailyTitle: '每日使用趨勢',
    actionsTitle: '累計操作',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '評分',
    lexiconTitle: '語詞與固定語句資料庫',
    lexiconSearch: '查詢中文、台語、台羅、俗語、成語',
    lexiconEmpty: '目前沒有符合的詞語',
    sourcesTitle: '來源授權治理台帳',
    requestCorpus: '申請多語系語料',
    multilingualCorpus: '多語系語料',
    pendingReview: '待補稿',
    draft: '草稿',
  },
  'zh-Hans': {
    subtitle: '中文稿 → 台语稿 → 语音 → 字幕波形影片',
    work: '工作',
    jobs: '工作总览',
    lexicon: '词语数据库',
    stats: '统计趋势',
    sources: '来源授权',
    refresh: '刷新',
    signOut: '登出',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: '建立台语语音影片工作',
    createHelp: '输入中文稿后，系统会先产生台语草稿与台罗辅助稿，再分段生成语音并输出字幕影片。台语草稿栏可直接覆写，适合人工校稿后再送出。',
    jobKindScript: '稿件影片',
    jobKindWord: '词语语音',
    rateAudio: '语音评分',
    generateWord: '产生新的语音版本',
    regenerateWord: '申请重新产生语音',
    reportIssue: '回报素材有问题',
    overviewTitle: '系统概览',
    overviewHelp: '公开累计使用状况',
    statsTitle: '统计',
    statsDailyTitle: '每日使用趋势',
    actionsTitle: '累计操作',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '评分',
    lexiconTitle: '词语与固定语句数据库',
    lexiconSearch: '查询中文、台语、台罗、俗语、成语',
    lexiconEmpty: '目前没有符合的词语',
    sourcesTitle: '来源授权治理台账',
    requestCorpus: '申请多语系语料',
    multilingualCorpus: '多语系语料',
    pendingReview: '待补稿',
    draft: '草稿',
  },
  en: {
    subtitle: 'Chinese draft → Taigi draft → Speech → Captioned waveform video',
    work: 'Work',
    jobs: 'Jobs',
    lexicon: 'Lexicon',
    stats: 'Stats',
    sources: 'Sources',
    refresh: 'Refresh',
    signOut: 'Sign out',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: 'Create Taigi Voice Video Job',
    createHelp: 'Enter a Chinese draft. The system creates a Taigi draft and Tailo helper text, then generates segmented speech and a captioned video.',
    jobKindScript: 'Script video',
    jobKindWord: 'Word audio',
    rateAudio: 'Audio rating',
    generateWord: 'Generate new audio',
    regenerateWord: 'Request regeneration',
    reportIssue: 'Report issue',
    overviewTitle: 'System Overview',
    overviewHelp: 'Public cumulative usage',
    statsTitle: 'Stats',
    statsDailyTitle: 'Daily Usage Trend',
    actionsTitle: 'Cumulative Actions',
    dailyPlay: 'Plays',
    dailyShare: 'Shares',
    dailyRate: 'Ratings',
    lexiconTitle: 'Words and Fixed Phrases',
    lexiconSearch: 'Search Chinese, Taigi, Tailo, idioms, phrases',
    lexiconEmpty: 'No matching entries',
    sourcesTitle: 'Source and License Governance Ledger',
    requestCorpus: 'Request multilingual corpus',
    multilingualCorpus: 'Multilingual corpus',
    pendingReview: 'Pending',
    draft: 'Draft',
  },
  ja: {
    subtitle: '中国語原稿 → 台湾語原稿 → 音声 → 字幕付き波形動画',
    work: '作成',
    jobs: 'ジョブ一覧',
    lexicon: '語彙データベース',
    stats: '統計',
    sources: '出典',
    refresh: '更新',
    signOut: 'サインアウト',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: '台湾語音声動画ジョブを作成',
    createHelp: '中国語原稿を入力すると、台湾語草稿と台羅補助稿を作成し、分割音声と字幕動画を生成します。',
    jobKindScript: '原稿動画',
    jobKindWord: '語彙音声',
    rateAudio: '音声評価',
    generateWord: '新しい音声を生成',
    regenerateWord: '再生成を依頼',
    reportIssue: '問題を報告',
    overviewTitle: 'システム概要',
    overviewHelp: '公開累計利用状況',
    statsTitle: '統計',
    statsDailyTitle: '日別利用傾向',
    actionsTitle: '累計操作',
    dailyPlay: '再生',
    dailyShare: '共有',
    dailyRate: '評価',
    lexiconTitle: '語彙と定型句データベース',
    lexiconSearch: '中国語、台湾語、台羅、慣用句を検索',
    lexiconEmpty: '一致する語彙はありません',
    sourcesTitle: '出典・ライセンス管理台帳',
    requestCorpus: '多言語コーパス申請',
    multilingualCorpus: '多言語コーパス',
    pendingReview: '未翻訳',
    draft: '草稿',
  },
  ko: {
    subtitle: '중국어 원고 → 대만어 원고 → 음성 → 자막 파형 영상',
    work: '작업',
    jobs: '작업 목록',
    lexicon: '어휘 데이터베이스',
    stats: '통계',
    sources: '출처',
    refresh: '새로고침',
    signOut: '로그아웃',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: '대만어 음성 영상 작업 만들기',
    createHelp: '중국어 원고를 입력하면 대만어 초안과 Tailo 보조문을 만들고, 분할 음성과 자막 영상을 생성합니다.',
    jobKindScript: '원고 영상',
    jobKindWord: '어휘 음성',
    rateAudio: '음성 평가',
    generateWord: '새 음성 생성',
    regenerateWord: '재생성 요청',
    reportIssue: '문제 신고',
    overviewTitle: '시스템 개요',
    overviewHelp: '공개 누적 사용 현황',
    statsTitle: '통계',
    statsDailyTitle: '일별 사용 추세',
    actionsTitle: '누적 작업',
    dailyPlay: '재생',
    dailyShare: '공유',
    dailyRate: '평점',
    lexiconTitle: '어휘 및 고정 표현 데이터베이스',
    lexiconSearch: '중국어, 대만어, Tailo, 관용구 검색',
    lexiconEmpty: '일치하는 항목이 없습니다',
    sourcesTitle: '출처 및 라이선스 관리 대장',
    requestCorpus: '다국어 말뭉치 신청',
    multilingualCorpus: '다국어 말뭉치',
    pendingReview: '대기',
    draft: '초안',
  },
  taigi: {
    subtitle: '華語稿 → 台語稿 → 聲音 → 字幕波形影片',
    work: '工課',
    jobs: '工課總覽',
    lexicon: '語詞資料庫',
    stats: '統計趨勢',
    sources: '來源授權',
    refresh: '閣整理',
    signOut: '登出',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: '建立台語聲音影片工課',
    createHelp: '輸入華語稿了後，系統會先產生台語草稿佮台羅輔助稿，閣分段產生聲音佮字幕影片。',
    jobKindScript: '稿件影片',
    jobKindWord: '語詞聲音',
    rateAudio: '聲音評分',
    generateWord: '產生新的聲音版本',
    regenerateWord: '申請閣再產生聲音',
    reportIssue: '回報素材有問題',
    overviewTitle: '系統概覽',
    overviewHelp: '公開累計使用狀況',
    statsTitle: '統計',
    statsDailyTitle: '逐日使用趨勢',
    actionsTitle: '累計動作',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '評分',
    lexiconTitle: '語詞佮固定語句資料庫',
    lexiconSearch: '查中文、台語、台羅、俗語、成語',
    lexiconEmpty: '目前無符合的語詞',
    sourcesTitle: '來源授權治理台帳',
    requestCorpus: '申請多語系語料',
    multilingualCorpus: '多語系語料',
    pendingReview: '咧等補稿',
    draft: '草稿',
  },
  tailo: {
    subtitle: 'Huâ-gí khó → Tâi-gí khó → Siann-im → Jī-bō 波形影片',
    work: 'Kang-khò',
    jobs: 'Kang-khò chóng-lám',
    lexicon: 'Gí-sû tsu-liāu-khòo',
    stats: 'Thong-kè',
    sources: 'Guân-thâu',
    refresh: 'Koh tsíng-lí',
    signOut: 'Teng-tshut',
    public: 'Public',
    admin: 'Admin',
    user: 'User',
    createTitle: 'Kiàn-li̍p Tâi-gí siann-im iánn-phìnn kang-khò',
    createHelp: 'Su-ji̍p Huâ-gí khó āu, hē-thóng ē sing sán-sing Tâi-gí tsháu-kó kap Tâi-lô hû-tsōo khó.',
    jobKindScript: 'Khó iánn-phìnn',
    jobKindWord: 'Gí-sû siann-im',
    rateAudio: 'Siann-im phîng-hun',
    generateWord: 'Sán-sing sin siann-im',
    regenerateWord: 'Tshing-kiû koh sán-sing',
    reportIssue: 'Huê-pòo būn-tê',
    overviewTitle: 'Hē-thóng khài-lám',
    overviewHelp: 'Kong-khui luí-ke sú-iōng tsōng-hóng',
    statsTitle: 'Thong-kè',
    statsDailyTitle: 'Ji̍t-ji̍t sú-iōng tshu-sè',
    actionsTitle: 'Luí-ke tōng-tsok',
    dailyPlay: 'Pòo-hòng',
    dailyShare: 'Hun-hióng',
    dailyRate: 'Phîng-hun',
    lexiconTitle: 'Gí-sû kap kòo-tīng gí-kù tsu-liāu-khòo',
    lexiconSearch: 'Tshiau Tiong-bûn, Tâi-gí, Tâi-lô, sio̍k-gí',
    lexiconEmpty: 'Bô ha̍p ê gí-sû',
    sourcesTitle: 'Guân-thâu sû-khuân tī-lí tâi-tiùnn',
    requestCorpus: 'Tshing-kiû tō-gí-hē gí-liāu',
    multilingualCorpus: 'Tō-gí-hē gí-liāu',
    pendingReview: 'Tán póo-kó',
    draft: 'Tsháu-kó',
  },
};

const ACTION_TEXT: Record<UiLanguage, Record<string, string>> = {
  'zh-Hant': {
    play_audio: '播放音訊',
    play_video: '播放影片',
    create_job: '建立稿件工作',
    create_word_asset_job: '建立詞語語音工作',
    regenerate_job: '用修正稿重新生成',
    rate_job: '評分音訊影片',
    rate_segment: '評分分段',
    rate_word: '評分詞條',
    rate_word_asset: '評分詞語語音',
    word_query: '查詢語詞',
    copy_share_link: '複製分享連結',
    share_line: '分享到 LINE',
    share_facebook: '分享到 Facebook',
    share_x: '分享到 X',
    request_word_translations: '申請詞條多語系語料',
    anonymous_nickname_change: '變更匿名暱稱',
  },
  'zh-Hans': {
    play_audio: '播放音频',
    play_video: '播放影片',
    create_job: '建立稿件工作',
    create_word_asset_job: '建立词语语音工作',
    regenerate_job: '用修正稿重新生成',
    rate_job: '评分音频影片',
    rate_segment: '评分分段',
    rate_word: '评分词条',
    rate_word_asset: '评分词语语音',
    word_query: '查询词语',
    copy_share_link: '复制分享链接',
    share_line: '分享到 LINE',
    share_facebook: '分享到 Facebook',
    share_x: '分享到 X',
    request_word_translations: '申请词条多语系语料',
    anonymous_nickname_change: '变更匿名昵称',
  },
  en: {
    play_audio: 'Audio plays',
    play_video: 'Video plays',
    create_job: 'Script jobs created',
    create_word_asset_job: 'Word audio jobs created',
    regenerate_job: 'Regenerated from corrections',
    rate_job: 'Media ratings',
    rate_segment: 'Segment ratings',
    rate_word: 'Lexicon entry ratings',
    rate_word_asset: 'Word audio ratings',
    word_query: 'Lexicon searches',
    copy_share_link: 'Share links copied',
    share_line: 'Shared to LINE',
    share_facebook: 'Shared to Facebook',
    share_x: 'Shared to X',
    request_word_translations: 'Multilingual corpus requests',
    anonymous_nickname_change: 'Anonymous nickname changes',
  },
  ja: {
    play_audio: '音声再生',
    play_video: '動画再生',
    create_job: '原稿ジョブ作成',
    create_word_asset_job: '語彙音声ジョブ作成',
    regenerate_job: '修正稿から再生成',
    rate_job: '音声動画評価',
    rate_segment: '分段評価',
    rate_word: '語彙評価',
    rate_word_asset: '語彙音声評価',
    word_query: '語彙検索',
    copy_share_link: '共有リンクをコピー',
    share_line: 'LINE へ共有',
    share_facebook: 'Facebook へ共有',
    share_x: 'X へ共有',
    request_word_translations: '多言語コーパス申請',
    anonymous_nickname_change: '匿名ニックネーム変更',
  },
  ko: {
    play_audio: '음성 재생',
    play_video: '영상 재생',
    create_job: '원고 작업 생성',
    create_word_asset_job: '어휘 음성 작업 생성',
    regenerate_job: '수정본으로 재생성',
    rate_job: '음성/영상 평점',
    rate_segment: '분단 평점',
    rate_word: '어휘 평점',
    rate_word_asset: '어휘 음성 평점',
    word_query: '어휘 검색',
    copy_share_link: '공유 링크 복사',
    share_line: 'LINE 공유',
    share_facebook: 'Facebook 공유',
    share_x: 'X 공유',
    request_word_translations: '다국어 말뭉치 신청',
    anonymous_nickname_change: '익명 닉네임 변경',
  },
  taigi: {
    play_audio: '播放聲音',
    play_video: '播放影片',
    create_job: '建立稿件工課',
    create_word_asset_job: '建立語詞聲音工課',
    regenerate_job: '用修正稿閣生成',
    rate_job: '評分聲音影片',
    rate_segment: '評分分段',
    rate_word: '評分語詞',
    rate_word_asset: '評分語詞聲音',
    word_query: '查語詞',
    copy_share_link: '複製分享連結',
    share_line: '分享到 LINE',
    share_facebook: '分享到 Facebook',
    share_x: '分享到 X',
    request_word_translations: '申請語詞多語系語料',
    anonymous_nickname_change: '改匿名暱稱',
  },
  tailo: {
    play_audio: 'Pòo-hòng siann-im',
    play_video: 'Pòo-hòng iánn-phìnn',
    create_job: 'Kiàn-li̍p khó kang-khò',
    create_word_asset_job: 'Kiàn-li̍p gí-sû siann-im kang-khò',
    regenerate_job: 'Iōng siu-tsìnn khó koh sán-sing',
    rate_job: 'Siann-im iánn-phìnn phîng-hun',
    rate_segment: 'Hun-tuānn phîng-hun',
    rate_word: 'Gí-sû phîng-hun',
    rate_word_asset: 'Gí-sû siann-im phîng-hun',
    word_query: 'Tshiau gí-sû',
    copy_share_link: 'Khóo-pih hun-hióng liân-kiat',
    share_line: 'Hun-hióng kàu LINE',
    share_facebook: 'Hun-hióng kàu Facebook',
    share_x: 'Hun-hióng kàu X',
    request_word_translations: 'Tshing-kiû gí-sû tō-gí-hē gí-liāu',
    anonymous_nickname_change: 'Kái bû-miâ phiau-hō',
  },
};

function initialUiLanguage(): UiLanguage {
  try {
    const stored = window.localStorage.getItem('taigi_web_ui_language') as UiLanguage | null;
    if (stored && UI_LANGUAGES.some((item) => item.value === stored)) return stored;
  } catch {
    // Fall back to browser language.
  }
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith('zh-cn') || browserLanguage.startsWith('zh-sg')) return 'zh-Hans';
  if (browserLanguage.startsWith('ja')) return 'ja';
  if (browserLanguage.startsWith('ko')) return 'ko';
  if (browserLanguage.startsWith('en')) return 'en';
  return 'zh-Hant';
}

type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

interface Job {
  id: string;
  kind?: 'script' | 'word_asset';
  title: string;
  status: JobStatus;
  stage: string;
  progress: number;
  created_at: number;
  updated_at: number;
  started_at?: number | null;
  completed_at?: number | null;
  elapsed_seconds?: number | null;
  chinese_text: string;
  taigi_text: string;
  tailo_text: string;
  segment_count: number;
  output_dir?: string | null;
  audio_path?: string | null;
  video_path?: string | null;
  zip_path?: string | null;
  onedrive_dir?: string | null;
  error?: string | null;
  rating_average?: number | null;
  rating_count?: number;
  my_rating?: number | null;
  my_note?: string;
  play_count?: number;
  audio_play_count?: number;
  video_play_count?: number;
  metadata?: Record<string, unknown>;
}

interface Segment {
  index: number;
  source_text: string;
  taigi_text: string;
  tailo_text: string;
  audio_file: string;
  duration?: number;
  start?: number;
  end?: number;
  rating?: number | null;
  feedback_count?: number;
  average_rating?: number | null;
  rating_count?: number;
  my_rating?: number | null;
  my_note?: string;
  corrected_taigi_text?: string;
  corrected_tailo_text?: string;
}

interface SegmentReviewPayload {
  rating: number;
  note: string;
  corrected_taigi_text: string;
  corrected_tailo_text: string;
  corrections: Array<{
    source_phrase: string;
    taigi_correction: string;
    tailo_correction: string;
    note: string;
  }>;
}

interface AuthStatus {
  authenticated: boolean;
  is_admin?: boolean;
  email?: string | null;
  anonymous?: {
    id: string;
    nickname: string;
    display_name: string;
    nickname_change_count?: number;
    nickname_history?: Array<{ from: string; to: string; changed_at: number }>;
  } | null;
  anonymous_nickname_options?: string[];
  token_required: boolean;
  loopback_only: boolean;
  auth_method?: string;
}

interface ApiInfo {
  default_device: string;
  default_copy_to_onedrive: boolean;
  default_reference_voice_mode?: 'default' | 'random';
  public_rate_limit_seconds?: number;
  reference_voice_modes?: { value: 'default' | 'random'; label: string }[];
  voice_control_options?: { value: string; label: string }[];
  anonymous_nickname_options?: { value: string; label: string }[];
  translation_memory?: string;
  pipeline: string[];
}

interface AdminSettings {
  default_reference_voice_mode: 'default' | 'random';
  public_rate_limit_seconds: number;
  api_access_token: string;
  postgres_dsn: string;
  postgres_schema: string;
}

interface PostgresExportResult {
  exported: boolean;
  schema_name: string;
  kv_rows: number;
  job_rows: number;
  exported_at: number;
}

interface QueueStatus {
  authenticated: boolean;
  private_client: boolean;
  rate_limit: {
    limit_seconds: number;
    wait_seconds: number;
    can_submit: boolean;
    next_available_at: number;
    sentence_limit: number;
  };
  queue: {
    running_count: number;
    queued_count: number;
    next_position: number;
  };
}

interface WordEntry {
  id: string;
  source: string;
  taigi: string;
  tailo: string;
  kind?: string;
  category?: string;
  note?: string;
  source_type?: string;
  count: number;
  play_count?: number;
  audio_play_count?: number;
  video_play_count?: number;
  rating_average?: number | null;
  rating_count?: number;
  my_rating?: number | null;
  my_note?: string;
  problem?: boolean;
  problem_reason?: string;
  has_audio?: boolean;
  has_video?: boolean;
  generation_status?: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
  generation_stage?: string;
  generation_progress?: number;
  generation_error?: string;
  generation_position?: number;
  generation_job_id?: string;
  assets?: WordAsset[];
  multilingual?: Record<string, {
    language: string;
    text: string;
    status: 'draft' | 'pending' | 'reviewed';
    note?: string;
    requested_by_name?: string;
    requested_at?: number;
    updated_at?: number;
  }>;
  multilingual_request_count?: number;
}

interface WordAsset {
  id: string;
  has_audio?: boolean;
  has_video?: boolean;
  created_at?: number;
  generated_by_name?: string;
  generated_by_id?: string;
  play_count?: number;
  audio_play_count?: number;
  video_play_count?: number;
  rating_average?: number | null;
  rating_count?: number;
  my_rating?: number | null;
  my_note?: string;
}

interface StatsSummary {
  total_plays: number;
  audio_plays: number;
  video_plays: number;
  audio_files: number;
  video_files: number;
  job_audio_files: number;
  job_video_files: number;
  word_audio_files: number;
  word_video_files: number;
  jobs_total: number;
  jobs_complete: number;
  jobs_running: number;
  jobs_queued: number;
  jobs_failed: number;
  words_total: number;
  word_queries_total: number;
  actions?: Record<string, number>;
  daily?: Array<{
    date: string;
    total: number;
    actions: Record<string, number>;
  }>;
}

interface FormValues {
  title: string;
  chinese_text: string;
  taigi_override?: string;
  reference_voice_mode: 'default' | 'random';
  control: string;
  device: string;
  inference_timesteps: number;
  cfg_value: number;
  max_chars_per_segment: number;
  make_video: boolean;
  copy_to_onedrive: boolean;
}

const statusColor: Record<JobStatus, string> = {
  queued: 'default',
  running: 'processing',
  complete: 'success',
  failed: 'error',
};

const pipelineSteps = [
  { key: 'translate', label: '翻譯', color: '#1677ff', match: ['Translating'] },
  { key: 'segment', label: '分段', color: '#13a8a8', match: ['Splitting'] },
  { key: 'tts', label: '語音', color: '#722ed1', match: ['Generating audio'] },
  { key: 'join', label: '合併', color: '#eb2f96', match: ['Joining'] },
  { key: 'subtitle', label: '字幕', color: '#fa8c16', match: ['Preparing subtitles'] },
  { key: 'video', label: '影片', color: '#52c41a', match: ['Rendering waveform video'] },
  { key: 'package', label: '打包', color: '#faad14', match: ['Packaging'] },
];

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value * 1000));
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes} 分 ${rest} 秒`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} 小時 ${mins} 分`;
}

function formatWait(seconds: number) {
  if (seconds <= 0) return '可以送出';
  return formatDuration(seconds) ?? '可以送出';
}

function inlineText(value: string) {
  return value.replace(/\s*\n+\s*/g, ' ').trim();
}

function firstSentence(value: string, limit = 56) {
  const cleaned = inlineText(value);
  const first = cleaned.match(/^.*?[。！？!?]/)?.[0] ?? cleaned;
  return first.length > limit ? `${first.slice(0, limit)}...` : first;
}

function activeStepIndex(job?: Job | null) {
  if (!job) return -1;
  if (job.status === 'complete') return pipelineSteps.length;
  if (job.status === 'failed') return -1;
  if (job.status === 'queued') return -1;
  return pipelineSteps.findIndex((step) => step.match.some((marker) => job.stage.includes(marker)));
}

function PipelineStrip({ job, compact = false }: { job?: Job | null; compact?: boolean }) {
  const active = activeStepIndex(job);
  return (
    <div className={`pipeline-strip ${compact ? 'is-compact' : ''}`}>
      {pipelineSteps.map((step, index) => {
        const isDone = active === pipelineSteps.length || (active >= 0 && index < active);
        const isActive = active === index;
        return (
          <div
            key={step.key}
            className={`pipeline-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
            style={{
              '--step-color': step.color,
            } as React.CSSProperties}
          >
            <span className="pipeline-dot" />
            {!compact && <span>{step.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

const defaultChineseText = '大家好，今天想聽一段台語語音影片。';

const exampleTexts = [
  {
    label: '日常問候',
    text: '大家好，午安啊！今天是星期六，待在家裡沒什麼事，就試著請 Codex 建立中文轉台語語音影片的流程。',
  },
  {
    label: '新聞開場',
    text: '早安，今天想聽的新聞重點，是人工智慧、半導體產業，還有台灣科技公司的最新發展。',
  },
  {
    label: '工具介紹',
    text: '這個網頁工具可以輸入中文稿，翻譯成台語文字，再產生語音、字幕和音訊波形影片。',
  },
  {
    label: '學習台語',
    text: '我想每天練習一句台語，先看中文原文，再對照台語文字和台羅拼音，慢慢累積自己的詞彙。',
  },
  {
    label: '個人頻道',
    text: '與其每天看別人做的 AI 影片，不如自己訂閱有興趣的主題，讓 AI 每天早上生成一支影片給我聽。',
  },
];

function validPageTab(value: string | null) {
  return value === 'work' || value === 'jobs' || value === 'lexicon' || value === 'stats' || value === 'sources';
}

function initialPageTab() {
  const queryTab = new URLSearchParams(window.location.search).get('tab');
  if (validPageTab(queryTab)) return queryTab;
  try {
    const storedTab = window.localStorage.getItem('taigi_web_active_tab');
    if (validPageTab(storedTab)) return storedTab;
  } catch {
    return 'work';
  }
  return 'work';
}

function replaceQueryParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function mediaUrl(target: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('media', target);
  if (target.startsWith('word:')) {
    url.searchParams.set('tab', 'lexicon');
  } else {
    url.searchParams.set('tab', 'work');
  }
  return url.toString();
}

function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [wordQuery, setWordQuery] = useState('');
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(initialUiLanguage);
  const [activeTab, setActiveTab] = useState(initialPageTab);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentJobId, setSegmentJobId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, SegmentReviewPayload>>({});
  const [jobError, setJobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [exportingPostgres, setExportingPostgres] = useState(false);
  const [postgresExportResult, setPostgresExportResult] = useState<PostgresExportResult | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const [form] = Form.useForm<FormValues>();

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const signedIn = !!auth?.authenticated;
  const isAdmin = !!auth?.is_admin;
  const t = (key: string) => UI_TEXT[uiLanguage]?.[key] ?? UI_TEXT['zh-Hant'][key] ?? key;
  const actionLabel = (key: string) => ACTION_TEXT[uiLanguage]?.[key] ?? ACTION_TEXT['zh-Hant'][key] ?? key;
  const jobDisplayTitle = (job: Job) => firstSentence(job.chinese_text) || job.title;
  const jobGroups = useMemo(() => ([
    { key: 'running', label: '處理中', jobs: jobs.filter((job) => job.status === 'running') },
    { key: 'queued', label: '隊列中', jobs: jobs.filter((job) => job.status === 'queued') },
    { key: 'complete', label: '已完成', jobs: jobs.filter((job) => job.status === 'complete') },
    { key: 'failed', label: '失敗', jobs: jobs.filter((job) => job.status === 'failed') },
  ]), [jobs]);
  const publicWaitSeconds = queueStatus?.rate_limit.next_available_at
    ? Math.max(0, Math.ceil(queueStatus.rate_limit.next_available_at - nowSeconds))
    : 0;
  const visibleSegments = selectedJob?.id === segmentJobId ? segments : [];
  const selectedMedia = useMemo(() => new URLSearchParams(window.location.search).get('media') ?? '', []);

  const loadAuth = async () => {
    const res = await axios.get<AuthStatus>('/auth/status');
    setAuth(res.data);
  };

  const loadInfo = async () => {
    const res = await axios.get<ApiInfo>('/api/info');
    setApiInfo(res.data);
  };

  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await axios.get<{ jobs: Job[] }>('/jobs');
      const nextJobs = res.data.jobs;
      setJobs(nextJobs);
      setSelectedJobId((current) => {
        if (nextJobs.length === 0) return null;
        if (current && nextJobs.some((job) => job.id === current)) return current;
        return nextJobs[0].id;
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setAuth((current) => current ? { ...current, authenticated: false } : current);
      }
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadQueueStatus = async () => {
    const res = await axios.get<QueueStatus>('/api/status');
    setQueueStatus(res.data);
  };

  const loadWords = async (query = wordQuery) => {
    const res = await axios.get<{ words: WordEntry[]; total: number }>('/words', { params: { q: query, limit: 30 } });
    setWords(res.data.words);
  };

  const loadStats = async () => {
    const res = await axios.get<StatsSummary>('/stats');
    setStats(res.data);
  };

  const recordAction = async (action: string, targetType = '', targetId = '', metadata: Record<string, unknown> = {}) => {
    await axios.post('/stats/action', { action, target_type: targetType, target_id: targetId, metadata }).catch(() => undefined);
    await loadStats().catch(() => undefined);
  };

  const shareMedia = async (target: string, title: string, platform: 'copy' | 'native' | 'line' | 'facebook' | 'x' = 'copy') => {
    const url = mediaUrl(target);
    const [targetType, targetId] = target.split(':');
    if (platform === 'native' && navigator.share) {
      await navigator.share({ title, url });
    } else if (platform === 'line') {
      window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    } else if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank', 'noopener,noreferrer');
    } else {
      await navigator.clipboard.writeText(url);
      message.success('已複製分享連結');
    }
    await recordAction(platform === 'copy' ? 'copy_share_link' : `share_${platform}`, targetType, targetId, { target });
  };

  const loadAdminSettings = async () => {
    if (!auth?.is_admin) return;
    const res = await axios.get<AdminSettings>('/admin/settings');
    setAdminSettings(res.data);
  };

  const changeActiveTab = (nextTab: string) => {
    if (!validPageTab(nextTab)) return;
    setActiveTab(nextTab);
    try {
      window.localStorage.setItem('taigi_web_active_tab', nextTab);
    } catch {
      // Ignore storage failures; the URL still keeps the current tab on reload.
    }
    replaceQueryParam('tab', nextTab === 'work' ? null : nextTab);
  };

  const changeUiLanguage = (nextLanguage: UiLanguage) => {
    setUiLanguage(nextLanguage);
    try {
      window.localStorage.setItem('taigi_web_ui_language', nextLanguage);
    } catch {
      // Ignore storage failures; the current session still uses the selected language.
    }
  };

  const loadSegments = async (jobId: string) => {
    const res = await axios.get<{ segments: Segment[] }>(`/jobs/${jobId}/segments`);
    const nextSegments = res.data.segments;
    const nextDrafts: Record<number, SegmentReviewPayload> = {};
    for (const segment of nextSegments) {
      nextDrafts[segment.index] = {
        rating: segment.my_rating ?? segment.rating ?? 0,
        note: segment.my_note ?? '',
        corrected_taigi_text: inlineText(segment.corrected_taigi_text ?? segment.taigi_text),
        corrected_tailo_text: inlineText(segment.corrected_tailo_text ?? segment.tailo_text),
        corrections: [{ source_phrase: '', taigi_correction: '', tailo_correction: '', note: '' }],
      };
    }
    setSegments(nextSegments);
    setFeedbackDrafts(nextDrafts);
    setSegmentJobId(jobId);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginToken = params.get('token');
    if (loginToken) {
      axios.post('/auth/verify', { token: loginToken })
        .then(async () => {
          window.history.replaceState({}, document.title, window.location.pathname);
          await loadAuth();
          message.success('已登入');
        })
        .catch(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuth({ authenticated: false, is_admin: false, email: null, token_required: true, loopback_only: false });
          message.error('登入連結無效或已過期');
        });
    } else {
      loadAuth().catch(() => {
        setAuth({ authenticated: false, is_admin: false, email: null, token_required: true, loopback_only: false });
      });
    }
    loadInfo().catch(() => undefined);
    loadWords('').catch(() => undefined);
    loadStats().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (auth === null) return;
    loadJobs();
    loadQueueStatus().catch(() => undefined);
    loadStats().catch(() => undefined);
    const jobsTimer = window.setInterval(loadJobs, 2500);
    const statusTimer = window.setInterval(() => {
      loadQueueStatus().catch(() => undefined);
      loadStats().catch(() => undefined);
      if (activeTab === 'lexicon') loadWords().catch(() => undefined);
    }, 2500);
    const clockTimer = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => {
      window.clearInterval(jobsTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(clockTimer);
    };
  }, [auth?.authenticated, auth !== null, activeTab]);

  useEffect(() => {
    loadAdminSettings().catch(() => undefined);
  }, [auth?.is_admin]);

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== 'complete') {
      setSegments([]);
      setFeedbackDrafts({});
      setSegmentJobId(null);
      return;
    }
    setSegments([]);
    setFeedbackDrafts({});
    setSegmentJobId(null);
    loadSegments(selectedJob.id).catch(() => {
      setSegments([]);
      setFeedbackDrafts({});
      setSegmentJobId(null);
    });
  }, [selectedJob?.id, selectedJob?.status]);

  useEffect(() => {
    if (!selectedMedia) return;
    const [kind, id] = selectedMedia.split(':');
    if (kind === 'job' && id && jobs.some((job) => job.id === id)) {
      setSelectedJobId(id);
      changeActiveTab('work');
    }
    if (kind === 'word') {
      changeActiveTab('lexicon');
    }
  }, [selectedMedia, jobs.length]);

  const signIn = async () => {
    if (!loginEmail.trim()) {
      message.warning('請輸入 admin email');
      return;
    }
    try {
      await axios.post('/auth/magic-link', { email: loginEmail });
      setMagicLinkSent(true);
      message.success('登入連結已寄出');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '無法寄出登入連結');
    }
  };

  const logout = async () => {
      await axios.post('/auth/logout');
      setJobs([]);
      setAdminSettings(null);
      setSelectedJobId(null);
      await loadAuth();
  };

  const saveAdminSettings = async (values: AdminSettings) => {
    try {
      const res = await axios.put<AdminSettings>('/admin/settings', values);
      setAdminSettings(res.data);
      await loadInfo();
      message.success('管理設定已更新');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '無法更新管理設定');
    }
  };

  const saveAnonymousNickname = async (nickname: string) => {
    try {
      const res = await axios.put<{ saved: boolean; anonymous: AuthStatus['anonymous']; anonymous_nickname_options: string[] }>(
        '/auth/anonymous-nickname',
        { nickname },
      );
      setAuth((current) => current ? {
        ...current,
        anonymous: res.data.anonymous,
        anonymous_nickname_options: res.data.anonymous_nickname_options,
      } : current);
      message.success('匿名暱稱已更新');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || detail || '無法更新匿名暱稱');
    }
  };

  const exportPostgres = async () => {
    setExportingPostgres(true);
    setPostgresExportResult(null);
    try {
      const res = await axios.post<PostgresExportResult>('/admin/postgres/export', {}, { timeout: 60000 });
      setPostgresExportResult(res.data);
      message.success('已匯出 SQLite 資料到 PostgreSQL');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法匯出到 PostgreSQL');
    } finally {
      setExportingPostgres(false);
    }
  };

  const startJob = async (values: FormValues) => {
    setSubmitting(true);
    setJobError(null);
    try {
      const res = await axios.post<Job>('/jobs', values, { timeout: 60000 });
      setSelectedJobId(res.data.id);
      await loadJobs();
      await loadQueueStatus().catch(() => undefined);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success('工作已排入佇背景執行');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      let reason = '';
      if (detail && typeof detail === 'object') {
        if (detail.rate_limit || detail.queue) {
          setQueueStatus((current) => ({
            authenticated: current?.authenticated ?? signedIn,
            private_client: current?.private_client ?? false,
            rate_limit: detail.rate_limit ?? current?.rate_limit,
            queue: detail.queue ?? current?.queue,
          } as QueueStatus));
        }
        const wait = detail.rate_limit?.wait_seconds;
        const suffix = typeof wait === 'number' && wait > 0 ? `還要等待 ${formatWait(wait)}。` : '';
        const validation = Array.isArray(detail)
          ? detail.map((item) => item?.msg || JSON.stringify(item)).join('；')
          : '';
        reason = `${detail.message || validation || '後端拒絕建立工作。'}${suffix}`;
      } else {
        reason = detail || (axios.isAxiosError(error) && error.code === 'ECONNABORTED'
          ? '請求逾時，後端在 60 秒內沒有回應。'
          : axios.isAxiosError(error) && !error.response
          ? '無法連線到後端服務，可能是服務暫時中斷或網路不穩。'
          : '後端沒有回傳明確原因。');
      }
      const statusText = status ? `HTTP ${status}` : '無 HTTP 回應';
      const fullReason = `建立工作失敗：${reason}（${statusText}）`;
      setJobError(fullReason);
      message.error(fullReason);
    } finally {
      setSubmitting(false);
    }
  };

  const applyExample = (text: string) => {
    form.setFieldsValue({
      title: firstSentence(text),
      chinese_text: text,
      taigi_override: '',
    });
    message.success('已帶入範例句');
  };

  const openJobInWorkTab = (jobId: string) => {
    setSelectedJobId(jobId);
    changeActiveTab('work');
  };

  const deleteJob = async (job: Job) => {
    Modal.confirm({
      title: '刪除這个工作？',
      content: `會移除 ${jobDisplayTitle(job)} 的輸入稿和輸出檔案。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await axios.delete(`/jobs/${job.id}`);
          setSelectedJobId((current) => current === job.id ? null : current);
          await loadJobs();
          message.success('已刪除');
        } catch (error) {
          const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
          message.error(detail || '無法刪除工作');
        }
      },
    });
  };

  const selectedText = () => window.getSelection()?.toString().trim() ?? '';

  const updateFeedback = (segmentIndex: number, patch: Partial<SegmentReviewPayload>) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [segmentIndex]: {
        ...(current[segmentIndex] ?? {
          rating: 0,
          note: '',
          corrected_taigi_text: '',
          corrected_tailo_text: '',
          corrections: [{ source_phrase: '', taigi_correction: '', tailo_correction: '', note: '' }],
        }),
        ...patch,
      },
    }));
  };

  const updateCorrection = (
    segmentIndex: number,
    correctionIndex: number,
    field: 'source_phrase' | 'taigi_correction' | 'tailo_correction' | 'note',
    value: string,
  ) => {
    const draft = feedbackDrafts[segmentIndex];
    if (!draft) return;
    const corrections = draft.corrections.map((correction, index) => (
      index === correctionIndex ? { ...correction, [field]: value } : correction
    ));
    updateFeedback(segmentIndex, { corrections });
  };

  const addCorrection = (segmentIndex: number) => {
    const draft = feedbackDrafts[segmentIndex];
    if (!draft) return;
    updateFeedback(segmentIndex, {
      corrections: [...draft.corrections, { source_phrase: '', taigi_correction: '', tailo_correction: '', note: '' }],
    });
  };

  const submitFeedback = async (segment: Segment) => {
    const draft = feedbackDrafts[segment.index];
    if (!selectedJob || !draft || draft.rating < 1) {
      message.warning('請先替這段評分');
      return;
    }
    try {
      await axios.post(`/jobs/${selectedJob.id}/segments/${segment.index}/feedback`, {
        ...draft,
        corrections: draft.corrections.filter((correction) => (
          correction.source_phrase.trim()
          || correction.taigi_correction.trim()
          || correction.tailo_correction.trim()
          || correction.note.trim()
        )),
      });
      await loadSegments(selectedJob.id);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success('已儲存評分與修正，下一次翻譯會納入參考');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '儲存失敗');
    }
  };

  const regenerateFromCorrections = async () => {
    if (!selectedJob) return;
    setRegenerating(true);
    setJobError(null);
    try {
      const res = await axios.post<Job>(`/jobs/${selectedJob.id}/regenerate`, {}, { timeout: 60000 });
      setSelectedJobId(res.data.id);
      await loadJobs();
      await loadQueueStatus().catch(() => undefined);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success('已用修正後資料建立新的生成工作');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '後端拒絕重新生成。'
        : detail || '重新生成失敗。';
      const fullReason = `重新生成失敗：${reason}${status ? `（HTTP ${status}）` : ''}`;
      setJobError(fullReason);
      message.error(fullReason);
    } finally {
      setRegenerating(false);
    }
  };

  const reportWordIssue = async (word: WordEntry) => {
    try {
      await axios.post(`/words/${word.id}/issue`, { reason: '使用者回報詞語素材有問題，需要重新產生。' });
      await loadWords();
      message.success('已標記這個詞語素材需要重新產生');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法標記詞語問題');
    }
  };

  const rateJob = async (job: Job, rating: number) => {
    if (rating < 1) {
      message.warning('請選擇 1 到 5 顆星');
      return;
    }
    try {
      await axios.post(`/jobs/${job.id}/rating`, { rating, note: '' });
      await loadJobs();
      await loadStats().catch(() => undefined);
      if (selectedJob?.id === job.id && job.status === 'complete') {
        await loadSegments(job.id).catch(() => undefined);
      }
      message.success('已更新這支音訊影片的評分');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || detail || '無法評分');
    }
  };

  const rateWord = async (word: WordEntry, rating: number) => {
    if (rating < 1) {
      message.warning('請選擇 1 到 5 顆星');
      return;
    }
    try {
      await axios.post(`/words/${word.id}/rating`, { rating, note: '' });
      await loadWords();
      message.success('已更新詞語評分');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法評分');
    }
  };

  const rateWordAsset = async (word: WordEntry, asset: WordAsset, rating: number) => {
    if (rating < 1) {
      message.warning('請選擇 1 到 5 顆星');
      return;
    }
    try {
      await axios.post(`/words/${word.id}/assets/${asset.id}/rating`, { rating, note: '' });
      await loadWords();
      message.success('已更新這筆詞語語音評分');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法評分');
    }
  };

  const generateWordAudio = async (word: WordEntry) => {
    try {
      await axios.post(`/words/${word.id}/generate`, {}, { timeout: 30000 });
      await loadWords();
      await loadJobs();
      await loadStats().catch(() => undefined);
      message.success('已排入詞語語音重新產生佇列');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法產生詞語語音');
    }
  };

  const requestWordCorpus = async (word: WordEntry) => {
    try {
      await axios.post(`/words/${word.id}/translations`, {
        languages: UI_LANGUAGES.map((item) => item.value),
        overwrite: false,
      });
      await loadWords();
      await loadStats().catch(() => undefined);
      message.success('已建立這筆詞條的多語系語料申請');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法申請多語系語料');
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
          colorPrimary: '#0071e3',
          borderRadius: 12,
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f5f5f7',
        },
        components: {
          Layout: {
            headerBg: 'rgba(255, 255, 255, 0.8)',
            headerColor: '#1d1d1f',
          },
          Card: {
            boxShadowTertiary: '0 4px 12px rgba(0,0,0,0.05)',
          },
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="app-header">
          <div className="top-brand">
            <AudioOutlined className="top-brand-icon" />
            <div>
              <Title level={4} className="top-brand-title">Taigi Voice Video Web</Title>
              <Text type="secondary" className="top-brand-subtitle">{t('subtitle')}</Text>
            </div>
          </div>
          <nav className="top-nav" aria-label="Primary">
            {[
              { key: 'work', label: t('work') },
              { key: 'jobs', label: t('jobs') },
              { key: 'lexicon', label: t('lexicon') },
              { key: 'stats', label: t('stats') },
              { key: 'sources', label: t('sources') },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={activeTab === item.key ? 'is-active' : ''}
                onClick={() => changeActiveTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <Space className="top-actions" size={8}>
            <Select
              size="small"
              value={uiLanguage}
              options={UI_LANGUAGES}
              onChange={changeUiLanguage}
              className="language-select"
            />
            {signedIn ? (
              <>
                <Tag color={isAdmin ? 'success' : 'blue'}>{isAdmin ? t('admin') : t('user')}</Tag>
                {auth?.email && <Tag>{auth.email}</Tag>}
                <Button size="small" icon={<ReloadOutlined />} onClick={loadJobs} loading={loadingJobs}>{t('refresh')}</Button>
                <Button size="small" icon={<LogoutOutlined />} onClick={logout}>{t('signOut')}</Button>
              </>
            ) : (
              <>
                <Input
                  size="small"
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  onPressEnter={signIn}
                  placeholder="your@email.com"
                  className="header-login-input"
                />
                <Button size="small" type="primary" icon={<LockOutlined />} onClick={signIn}>
                  登入
                </Button>
                <Tag color="blue">{t('public')}</Tag>
              </>
            )}
          </Space>
        </Header>

        <Content className="app-content">
            <div className={`app-grid ${
              activeTab === 'lexicon' ? 'show-lexicon' : activeTab === 'jobs' ? 'show-jobs' : activeTab === 'stats' ? 'show-stats' : activeTab === 'sources' ? 'show-sources' : 'show-work'
            }`}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card className="create-job-card">
                  <div className="card-title">
                    <Title level={3}>{t('createTitle')}</Title>
                    <Paragraph type="secondary">
                      {t('createHelp')}
                    </Paragraph>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="工作流程"
                    description={<PipelineStrip />}
                  />
                  {!signedIn && queueStatus && (
                    <Alert
                      type={publicWaitSeconds > 0 ? 'warning' : 'info'}
                      showIcon
                      className="queue-status"
                      message={queueStatus.private_client
                        ? '內網使用者目前可以優先送出'
                        : publicWaitSeconds > 0
                        ? `未登入使用者還要等待 ${formatWait(publicWaitSeconds)} 才能再次生成`
                        : '未登入使用者目前可以送出一句'}
                      description={
                        <Space direction="vertical" size={2}>
                          <Text>
                            目前 {queueStatus.queue.running_count} 個工作執行中，{queueStatus.queue.queued_count} 個工作正在排隊。
                          </Text>
                          <Text type="secondary">
                            {queueStatus.private_client
                              ? `內網送出的工作會優先處理；現在送出會排在第 ${queueStatus.queue.next_position} 個。`
                              : `現在送出會排在第 ${queueStatus.queue.next_position} 個；未登入使用者每次限一句，間隔 ${formatWait(queueStatus.rate_limit.limit_seconds)}。`}
                          </Text>
                        </Space>
                      }
                    />
                  )}
                  <div className="example-strip">
                    <Text strong>經典範例句</Text>
                    <Space size={8} wrap style={{ marginTop: 8 }}>
                      {exampleTexts.map((example) => (
                        <Button key={example.label} onClick={() => applyExample(example.text)}>
                          {example.label}
                        </Button>
                      ))}
                    </Space>
                  </div>
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                      title: '台語語音影片',
                      chinese_text: defaultChineseText,
                      taigi_override: '',
                      reference_voice_mode: apiInfo?.default_reference_voice_mode ?? 'default',
                      control: 'default_male',
                      device: apiInfo?.default_device ?? 'mps',
                      inference_timesteps: 10,
                      cfg_value: 2.5,
                      max_chars_per_segment: 90,
                      make_video: true,
                      copy_to_onedrive: apiInfo?.default_copy_to_onedrive ?? true,
                    }}
                    onFinish={startJob}
                  >
                    <Form.Item label="標題" name="title" rules={[{ required: true }]}>
                      <Input prefix={<FileTextOutlined />} />
                    </Form.Item>
                    <Form.Item label="中文稿" name="chinese_text" rules={[{ required: true, message: '請輸入中文稿' }]}>
                      <TextArea rows={3} className="textarea-mono" />
                    </Form.Item>
                    <Form.Item label="台語稿覆寫（可留空，系統會先自動翻成草稿）" name="taigi_override">
                      <TextArea rows={3} className="textarea-mono" placeholder="人工校稿後的台語稿可貼佇遮" />
                    </Form.Item>
                    <Collapse
                      ghost
                      className="advanced-settings"
                      items={[
                        {
                          key: 'advanced',
                          label: '進階設定',
                          children: (
                            <>
                              <Flex gap={12} wrap>
                                <Form.Item label="參考聲音" name="reference_voice_mode" style={{ minWidth: 220 }}>
                                  <Select
                                    options={apiInfo?.reference_voice_modes ?? [
                                      { value: 'default', label: '預設聲音' },
                                      { value: 'random', label: '隨機生成' },
                                    ]}
                                  />
                                </Form.Item>
                                <Form.Item label="聲音控制詞" name="control" rules={[{ required: true }]} style={{ flex: '1 1 360px' }}>
                                  <Select
                                    options={apiInfo?.voice_control_options ?? [
                                      { value: 'default_male', label: '預設男聲，台灣口音，自然語速' },
                                      { value: 'warm_male', label: '溫和男聲，像廣播旁白' },
                                      { value: 'low_male', label: '低沉男聲，穩定親切，稍慢' },
                                      { value: 'clear_female', label: '清楚女聲，柔和自然' },
                                      { value: 'bright_young_male', label: '年輕男聲，明亮有精神' },
                                      { value: 'friendly_young_female', label: '年輕女聲，輕鬆親切' },
                                    ]}
                                  />
                                </Form.Item>
                              </Flex>
                              <Flex gap={12} wrap>
                                <Form.Item label="裝置" name="device" style={{ minWidth: 150 }}>
                                  <Select
                                    options={[
                                      { value: 'mps', label: 'MPS' },
                                      { value: 'cpu', label: 'CPU' },
                                      { value: 'cuda', label: 'CUDA' },
                                    ]}
                                  />
                                </Form.Item>
                                <Form.Item label="推論步數" name="inference_timesteps">
                                  <InputNumber min={4} max={30} />
                                </Form.Item>
                                <Form.Item label="CFG" name="cfg_value">
                                  <InputNumber min={1} max={4} step={0.1} />
                                </Form.Item>
                                <Form.Item label="每段字數" name="max_chars_per_segment">
                                  <InputNumber min={40} max={180} />
                                </Form.Item>
                              </Flex>
                              <Flex gap={18} wrap>
                                <Form.Item name="make_video" valuePropName="checked">
                                  <Checkbox>輸出 MP4 影片</Checkbox>
                                </Form.Item>
                                {isAdmin && (
                                  <Form.Item name="copy_to_onedrive" valuePropName="checked">
                                    <Checkbox>複製到 OneDrive</Checkbox>
                                  </Form.Item>
                                )}
                              </Flex>
                            </>
                          ),
                        },
                      ]}
                    />
                    <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submitting}>
                      排入工作
                    </Button>
                    {jobError && (
                      <Alert
                        type="error"
                        showIcon
                        className="job-error"
                        message="建立工作失敗"
                        description={jobError}
                      />
                    )}
                  </Form>
                </Card>

                <Card className="current-job-card">
                  <Flex align="center" justify="space-between" gap={12} className="card-title">
                    <Title level={3} style={{ margin: 0 }}>目前工作</Title>
                    {selectedJob && <Tag color={statusColor[selectedJob.status]}>{selectedJob.status}</Tag>}
                  </Flex>
                  {!selectedJob ? (
                    <Alert type="info" showIcon message="尚未建立工作" />
                  ) : (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      <div>
                        <Text strong>{jobDisplayTitle(selectedJob)}</Text>
                        <br />
                        <Text type="secondary">
                          {selectedJob.segment_count || 0} 段 · Created {formatTime(selectedJob.created_at)}
                          {formatDuration(selectedJob.elapsed_seconds) ? ` · 耗時 ${formatDuration(selectedJob.elapsed_seconds)}` : ''}
                          {selectedJob.rating_count ? ` · 平均 ${selectedJob.rating_average?.toFixed(1)} / 5（${selectedJob.rating_count} 票）` : ''}
                        </Text>
                      </div>
                      {selectedJob.status === 'complete' && (
                        <div className="job-media-panel">
                          <Flex align="center" justify="space-between" gap={10} wrap className="media-rating-row">
                            <div>
                              <Text strong>音訊影片評分</Text>
                              {!!selectedJob.rating_count && (
                                <>
                                  <br />
                                  <Text type="secondary">
                                    平均 {selectedJob.rating_average?.toFixed(1)} / 5（{selectedJob.rating_count} 票）
                                  </Text>
                                </>
                              )}
                            </div>
                            <Rate value={selectedJob.my_rating ?? 0} onChange={(rating) => rateJob(selectedJob, rating)} />
                          </Flex>
                          <div>
                            <Text strong>音訊播放</Text>
                            <audio
                              controls
                              preload="none"
                              src={`/jobs/${selectedJob.id}/download/audio`}
                            />
                            <Space size={8} wrap className="share-actions">
                              <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`job:${selectedJob.id}:audio`, jobDisplayTitle(selectedJob), 'copy')}>複製音訊連結</Button>
                              <Button size="small" icon={<LinkOutlined />} onClick={() => shareMedia(`job:${selectedJob.id}:audio`, jobDisplayTitle(selectedJob), 'line')}>LINE</Button>
                              <Button size="small" onClick={() => shareMedia(`job:${selectedJob.id}:audio`, jobDisplayTitle(selectedJob), 'facebook')}>Facebook</Button>
                              <Button size="small" onClick={() => shareMedia(`job:${selectedJob.id}:audio`, jobDisplayTitle(selectedJob), 'x')}>X</Button>
                            </Space>
                          </div>
                          {selectedJob.video_path && (
                            <div>
                              <Text strong>影片播放</Text>
                              <video
                                controls
                                preload="metadata"
                                src={`/jobs/${selectedJob.id}/download/video`}
                              />
                              <Space size={8} wrap className="share-actions">
                                <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`job:${selectedJob.id}:video`, jobDisplayTitle(selectedJob), 'copy')}>複製影片連結</Button>
                                <Button size="small" icon={<LinkOutlined />} onClick={() => shareMedia(`job:${selectedJob.id}:video`, jobDisplayTitle(selectedJob), 'line')}>LINE</Button>
                                <Button size="small" onClick={() => shareMedia(`job:${selectedJob.id}:video`, jobDisplayTitle(selectedJob), 'facebook')}>Facebook</Button>
                                <Button size="small" onClick={() => shareMedia(`job:${selectedJob.id}:video`, jobDisplayTitle(selectedJob), 'x')}>X</Button>
                              </Space>
                            </div>
                          )}
                        </div>
                      )}
                      <Progress percent={selectedJob.progress} status={selectedJob.status === 'failed' ? 'exception' : undefined} />
                      <PipelineStrip job={selectedJob} />
                      <Text type={selectedJob.status === 'failed' ? 'danger' : 'secondary'}>
                        {selectedJob.error || selectedJob.stage}
                      </Text>
                      {selectedJob.taigi_text && (
                        <Input.TextArea value={selectedJob.taigi_text} rows={5} readOnly className="textarea-mono" />
                      )}
                      {isAdmin && selectedJob.onedrive_dir && (
                        <Alert type="success" showIcon message="已複製到 OneDrive" description={selectedJob.onedrive_dir} />
                      )}
                      {selectedJob.status === 'complete' && (
                        <>
                          <div className="downloads">
                            <Button type="primary" icon={<DownloadOutlined />} href={`/jobs/${selectedJob.id}/download/zip`}>
                              全部下載
                            </Button>
                            <Button icon={<AudioOutlined />} href={`/jobs/${selectedJob.id}/download/audio`}>音訊</Button>
                            {selectedJob.video_path && (
                              <Button icon={<VideoCameraOutlined />} href={`/jobs/${selectedJob.id}/download/video`}>影片</Button>
                            )}
                            <Button href={`/jobs/${selectedJob.id}/download/taigi`}>台語稿</Button>
                            <Button href={`/jobs/${selectedJob.id}/download/tailo`}>台羅</Button>
                            <Button href={`/jobs/${selectedJob.id}/download/segments`}>分段 JSON</Button>
                            <Button onClick={regenerateFromCorrections} loading={regenerating}>
                              用修正稿重新生成
                            </Button>
                            {isAdmin && (
                              <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                                刪除
                              </Button>
                            )}
                          </div>
                          <Divider />
                          <Title level={4} style={{ margin: 0 }}>分段檢視與修正</Title>
                          {visibleSegments.length === 0 ? (
                            <Alert type="info" showIcon message="尚未載入分段資料" />
                          ) : (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                              {visibleSegments.map((segment) => {
                                const draft = feedbackDrafts[segment.index];
                                return (
                                  <div key={segment.index} className="segment-card">
                                    <Flex align="center" justify="space-between" gap={12} wrap>
                                      <Space>
                                        <Tag color="blue">Segment {segment.index}</Tag>
                                        {segment.duration && <Text type="secondary">{segment.duration.toFixed(2)}s</Text>}
                                        {!!segment.rating_count && (
                                          <Tag color="success">
                                            平均 {segment.average_rating?.toFixed(1)} / 5 · {segment.rating_count} 票
                                          </Tag>
                                        )}
                                        {!!segment.my_rating && <Tag color="gold">我的評分 {segment.my_rating}</Tag>}
                                      </Space>
                                      <Button href={`/jobs/${selectedJob.id}/segments/${segment.index}/audio`} icon={<DownloadOutlined />}>
                                        WAV
                                      </Button>
                                    </Flex>
                                    <audio
                                      controls
                                      preload="none"
                                      style={{ width: '100%', marginTop: 10 }}
                                      src={`/jobs/${selectedJob.id}/segments/${segment.index}/audio`}
                                    />
                                    <Space size={8} wrap className="share-actions">
                                      <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`segment:${selectedJob.id}:${segment.index}`, `${jobDisplayTitle(selectedJob)} Segment ${segment.index}`, 'copy')}>複製這段連結</Button>
                                      <Button size="small" onClick={() => shareMedia(`segment:${selectedJob.id}:${segment.index}`, `${jobDisplayTitle(selectedJob)} Segment ${segment.index}`, 'line')}>LINE</Button>
                                      <Button size="small" onClick={() => shareMedia(`segment:${selectedJob.id}:${segment.index}`, `${jobDisplayTitle(selectedJob)} Segment ${segment.index}`, 'facebook')}>Facebook</Button>
                                    </Space>
                                    <div className="segment-text-grid">
                                      <div>
                                        <Text strong>原本中文</Text>
                                        <Input.TextArea value={segment.source_text} autoSize readOnly className="textarea-mono compact-textarea" />
                                      </div>
                                      <div>
                                        <Text strong>台語文字</Text>
                                        <Input.TextArea value={inlineText(segment.taigi_text)} autoSize readOnly className="textarea-mono compact-textarea" />
                                      </div>
                                      <div>
                                        <Text strong>台羅拼音</Text>
                                        <Input.TextArea value={inlineText(segment.tailo_text)} autoSize readOnly className="textarea-mono compact-textarea" />
                                      </div>
                                    </div>
                                    {draft && (
                                      <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
                                        <Flex align="center" gap={12} wrap>
                                          <Text strong>正確度評分</Text>
                                          <Rate
                                            value={draft.rating}
                                            onChange={(rating) => updateFeedback(segment.index, { rating })}
                                          />
                                          <Text type="secondary">可選取上方文字，再按下「帶入選取詞」</Text>
                                        </Flex>
                                        <Input.TextArea
                                          rows={2}
                                          value={draft.note}
                                          onChange={(event) => updateFeedback(segment.index, { note: event.target.value })}
                                          placeholder="整段評語，例如：語音自然，但是「新聞」台語詞想改。"
                                        />
                                        <div className="segment-text-grid">
                                          <div>
                                            <Text strong>修正後台語文字</Text>
                                            <Input.TextArea
                                              autoSize={{ minRows: 1, maxRows: 6 }}
                                              value={draft.corrected_taigi_text}
                                              className="textarea-mono compact-textarea"
                                              onChange={(event) => updateFeedback(segment.index, { corrected_taigi_text: event.target.value })}
                                            />
                                          </div>
                                          <div>
                                            <Text strong>修正後台羅</Text>
                                            <Input.TextArea
                                              autoSize={{ minRows: 1, maxRows: 6 }}
                                              value={draft.corrected_tailo_text}
                                              className="textarea-mono compact-textarea"
                                              onChange={(event) => updateFeedback(segment.index, { corrected_tailo_text: event.target.value })}
                                            />
                                          </div>
                                        </div>
                                        {draft.corrections.map((correction, correctionIndex) => (
                                          <div className="correction-row" key={correctionIndex}>
                                            <Input
                                              value={correction.source_phrase}
                                              onChange={(event) => updateCorrection(segment.index, correctionIndex, 'source_phrase', event.target.value)}
                                              placeholder="原文字詞"
                                            />
                                            <Input
                                              value={correction.taigi_correction}
                                              onChange={(event) => updateCorrection(segment.index, correctionIndex, 'taigi_correction', event.target.value)}
                                              placeholder="台語修正"
                                            />
                                            <Input
                                              value={correction.tailo_correction}
                                              onChange={(event) => updateCorrection(segment.index, correctionIndex, 'tailo_correction', event.target.value)}
                                              placeholder="台羅修正"
                                            />
                                            <Button onClick={() => updateCorrection(segment.index, correctionIndex, 'source_phrase', selectedText())}>
                                              帶入選取詞
                                            </Button>
                                          </div>
                                        ))}
                                        <Flex gap={10} wrap>
                                          <Button onClick={() => addCorrection(segment.index)}>新增修正詞</Button>
                                          <Button type="primary" onClick={() => submitFeedback(segment)}>
                                            儲存這段回饋
                                          </Button>
                                        </Flex>
                                      </Space>
                                    )}
                                  </div>
                                );
                              })}
                            </Space>
                          )}
                        </>
                      )}
                      {isAdmin && selectedJob.status === 'failed' && (
                        <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                          刪除失敗工作
                        </Button>
                      )}
                    </Space>
                  )}
                </Card>
              </Space>

              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card className="side-stats-card">
                  <div className="card-title">
                    <Title level={4} style={{ margin: 0 }}>{t('overviewTitle')}</Title>
                    <Text type="secondary">{t('overviewHelp')}</Text>
                  </div>
                  {!stats ? (
                    <Alert type="info" showIcon message="正在載入統計" />
                  ) : (
                    <div className="side-stats-grid">
                      <div><Text type="secondary">總播放</Text><strong>{stats.total_plays}</strong></div>
                      <div><Text type="secondary">完成 Jobs</Text><strong>{stats.jobs_complete}</strong></div>
                      <div><Text type="secondary">音訊檔案</Text><strong>{stats.audio_files}</strong></div>
                      <div><Text type="secondary">影片檔案</Text><strong>{stats.video_files}</strong></div>
                      <div><Text type="secondary">語詞句庫</Text><strong>{stats.words_total}</strong></div>
                      <div><Text type="secondary">查詢次數</Text><strong>{stats.word_queries_total}</strong></div>
                    </div>
                  )}
                  {queueStatus && (
                    <div className="side-queue-summary">
                      <Text type="secondary">
                        佇列：{queueStatus.queue.running_count} 執行中，{queueStatus.queue.queued_count} 等待中
                      </Text>
                    </div>
                  )}
                </Card>

                {!signedIn ? (
                  <Card className="account-card">
                    <div className="card-title">
                      <Title level={4} style={{ margin: 0 }}>匿名使用者</Title>
                      <Text type="secondary">可先使用匿名台語暱稱評分與回報。</Text>
                    </div>
                    {magicLinkSent && (
                      <Alert
                        type="success"
                        showIcon
                        style={{ marginBottom: 14 }}
                        message="登入連結已寄出"
                        description="請到信箱點擊登入連結。"
                      />
                    )}
	                    {auth?.anonymous && (
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
	                          <div>
	                            <Text strong>匿名台語暱稱</Text>
	                            <br />
	                            <Text type="secondary">
	                              目前是 {auth.anonymous.display_name}，已變更 {auth.anonymous.nickname_change_count || 0} 次。
	                            </Text>
	                          </div>
	                          <Select
	                            value={auth.anonymous.nickname}
	                            options={(apiInfo?.anonymous_nickname_options ?? (auth.anonymous_nickname_options ?? []).map((nickname) => ({ value: nickname, label: nickname })))}
	                            onChange={saveAnonymousNickname}
	                          />
	                          {!!auth.anonymous.nickname_history?.length && (
	                            <Text type="secondary">
	                              最近一次：{auth.anonymous.nickname_history.at(-1)?.from} → {auth.anonymous.nickname_history.at(-1)?.to}
	                            </Text>
	                          )}
                      </Space>
	                    )}
	                  </Card>
                ) : !isAdmin ? (
                  <Card className="account-card">
                    <div className="card-title">
                      <Title level={3}>帳號</Title>
                      <Paragraph type="secondary">
                        已登入為 {auth?.email || '使用者'}。你可以對詞條、語音和影片評分；每筆資料只能保留一個自己的分數，但可以再次修改。
                      </Paragraph>
                    </div>
                    <Button icon={<LogoutOutlined />} onClick={logout}>登出</Button>
                  </Card>
                ) : (
                  <Card className="admin-card">
                    <div className="card-title">
                      <Title level={3}>Admin settings</Title>
                      <Paragraph type="secondary">
                        這些設定只對管理員開放，一般使用者不會看到。
                      </Paragraph>
                    </div>
                    {adminSettings ? (
                      <Form layout="vertical" initialValues={adminSettings} onFinish={saveAdminSettings}>
                        <Form.Item label="預設語音類別" name="default_reference_voice_mode">
                          <Select options={apiInfo?.reference_voice_modes ?? [
                            { value: 'default', label: '預設聲音' },
                            { value: 'random', label: '隨機生成' },
                          ]} />
                        </Form.Item>
                        <Form.Item label="公開使用 rate limit（秒）" name="public_rate_limit_seconds">
                          <InputNumber min={60} step={60} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item label="API access token" name="api_access_token">
                          <Input.Password placeholder="Bearer token" />
                        </Form.Item>
                        <Collapse
                          ghost
                          className="advanced-settings"
                          items={[
                            {
                              key: 'postgres',
                              label: 'PostgreSQL 外部備份',
                              children: (
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                  <Paragraph type="secondary" style={{ margin: 0 }}>
                                    可用 .env 的 TAIGI_WEB_POSTGRES_DSN 和 TAIGI_WEB_POSTGRES_SCHEMA 預設外部資料庫連線。
                                    匯出會建立 taigi_kv 與 taigi_jobs，並以 upsert 覆寫最新 SQLite 資料。
                                  </Paragraph>
                                  <Form.Item label="PostgreSQL DSN" name="postgres_dsn">
                                    <Input.Password placeholder="postgresql://user:password@host:5432/database" />
                                  </Form.Item>
                                  <Form.Item label="PostgreSQL schema" name="postgres_schema">
                                    <Input placeholder="public" />
                                  </Form.Item>
                                  <Flex gap={10} wrap>
                                    <Button onClick={exportPostgres} loading={exportingPostgres}>
                                      匯出 SQLite 到 PostgreSQL
                                    </Button>
                                  </Flex>
                                  {postgresExportResult && (
                                    <Alert
                                      type="success"
                                      showIcon
                                      message="已完成 PostgreSQL 匯出"
                                      description={`Schema ${postgresExportResult.schema_name}：${postgresExportResult.kv_rows} 筆設定資料，${postgresExportResult.job_rows} 筆 Jobs。`}
                                    />
                                  )}
                                </Space>
                              ),
                            },
                          ]}
                        />
                        <Button type="primary" htmlType="submit">儲存管理設定</Button>
                      </Form>
                    ) : (
                      <Alert type="info" showIcon message="正在載入管理設定" />
                    )}
                  </Card>
                )}

                <Card className="stats-card">
                  <Flex align="center" justify="space-between" className="card-title" gap={12}>
                    <Title level={3} style={{ margin: 0 }}>{t('statsTitle')}</Title>
                    <Button size="small" onClick={() => loadStats().catch(() => undefined)}>{t('refresh')}</Button>
                  </Flex>
                  {!stats ? (
                    <Alert type="info" showIcon message="正在載入統計" />
                  ) : (
                    <div className="stats-grid">
                      <div><Text type="secondary">總播放</Text><strong>{stats.total_plays}</strong></div>
                      <div><Text type="secondary">音訊播放</Text><strong>{stats.audio_plays}</strong></div>
                      <div><Text type="secondary">影片播放</Text><strong>{stats.video_plays}</strong></div>
                      <div><Text type="secondary">音訊檔案</Text><strong>{stats.audio_files}</strong></div>
                      <div><Text type="secondary">影片檔案</Text><strong>{stats.video_files}</strong></div>
                      <div><Text type="secondary">完成 Jobs</Text><strong>{stats.jobs_complete}</strong></div>
                      <div><Text type="secondary">語詞句庫</Text><strong>{stats.words_total}</strong></div>
                      <div><Text type="secondary">查詢次數</Text><strong>{stats.word_queries_total}</strong></div>
                    </div>
                  )}
                  {stats && (
                    <div className="stats-trends">
                      <Title level={4}>{t('statsDailyTitle')}</Title>
                      {(stats.daily ?? []).slice(-14).map((day) => {
                        const maxDaily = Math.max(1, ...(stats.daily ?? []).map((item) => item.total || 0));
                        return (
                          <div key={day.date} className="daily-row">
                            <Text className="daily-date">{day.date}</Text>
                            <div className="daily-bar-wrap">
                              <div className="daily-bar" style={{ width: `${Math.max(4, ((day.total || 0) / maxDaily) * 100)}%` }} />
                            </div>
                            <Text>{day.total || 0}</Text>
                            <Text type="secondary">
                              {t('dailyPlay')} {(day.actions?.play_audio || 0) + (day.actions?.play_video || 0)}
                              {' '}{t('dailyShare')} {(day.actions?.copy_share_link || 0) + (day.actions?.share_line || 0) + (day.actions?.share_facebook || 0) + (day.actions?.share_x || 0)}
                              {' '}{t('dailyRate')} {(day.actions?.rate_job || 0) + (day.actions?.rate_word || 0) + (day.actions?.rate_segment || 0)}
                            </Text>
                          </div>
                        );
                      })}
                      <Title level={4}>{t('actionsTitle')}</Title>
                      <div className="action-grid">
                        {Object.entries(stats.actions ?? {}).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
                          <div key={action}>
                            <Text type="secondary">{actionLabel(action)}</Text>
                            <strong>{count}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                <Card className="sources-card">
                  <div className="card-title">
                    <Title level={3} style={{ margin: 0 }}>{t('sourcesTitle')}</Title>
                    <Paragraph type="secondary">
                      這裡按照公開營運前的授權治理建議，記錄每個工具、模型、辭源與公開資料庫的來源、授權狀態、本站用途與治理動作。
                      「待確認」的資料只做人工查詢或校稿參考，不直接批次匯入、再散布或作為可下載資料庫。
                    </Paragraph>
                  </div>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <div className="source-section">
                      <Flex align="center" justify="space-between" gap={12} wrap>
                        <Title level={4}>授權狀態分類</Title>
                        <Space wrap>
                          <Tag color="success">可納入系統依賴</Tag>
                          <Tag color="processing">本站自有/使用者貢獻</Tag>
                          <Tag color="warning">待確認後再匯入</Tag>
                          <Tag color="error">不得匯入</Tag>
                        </Space>
                      </Flex>
                      <div className="governance-grid">
                        <div>
                          <Text strong>可納入系統依賴</Text>
                          <Text type="secondary">開源授權明確，可作為程式、模型或工具使用；仍需保留授權文字與來源連結。</Text>
                        </div>
                        <div>
                          <Text strong>本站自有/使用者貢獻</Text>
                          <Text type="secondary">由本站建立或使用者回饋產生，需在服務條款中說明投稿資料可被用於改進轉譯與語音生成。</Text>
                        </div>
                        <div>
                          <Text strong>待確認後再匯入</Text>
                          <Text type="secondary">可人工參考，但正式匯入 SQLite、開放查詢或輸出檔案前，需要確認可商用、可改作、可再散布與署名條件。</Text>
                        </div>
                        <div>
                          <Text strong>不得匯入</Text>
                          <Text type="secondary">沒有可再利用授權、禁止爬取、禁止商用或只允許個人瀏覽的資料，不放入本站資料庫。</Text>
                        </div>
                      </div>
                    </div>

                    <div className="source-section">
                      <Title level={4}>模型、工具與框架</Title>
                      <div className="source-table">
                        <div className="source-row source-row-head">
                          <Text strong>來源</Text>
                          <Text strong>授權/狀態</Text>
                          <Text strong>本站用途</Text>
                          <Text strong>治理動作</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>VoxCPM / VoxCPM2</Text>
                            <Typography.Link href="https://github.com/OpenBMB/VoxCPM" target="_blank">GitHub</Typography.Link>
                            <Typography.Link href="https://huggingface.co/openbmb/VoxCPM2" target="_blank">Hugging Face model</Typography.Link>
                          </div>
                          <div><Tag color="success">Apache-2.0</Tag><Text type="secondary">本機 README、LICENSE、pyproject 均標示 Apache-2.0。</Text></div>
                          <Text type="secondary">依台語稿與參考聲音產生 wav 語音，並供影片流程使用。</Text>
                          <Text type="secondary">保留 LICENSE；公開頁標示 AI 生成；禁止冒名、詐欺、誤導用途。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>PyTorch / torchaudio</Text>
                            <Typography.Link href="https://pytorch.org/" target="_blank">PyTorch</Typography.Link>
                            <Typography.Link href="https://github.com/pytorch/audio" target="_blank">torchaudio</Typography.Link>
                          </div>
                          <div><Tag color="success">BSD-style</Tag><Text type="secondary">本機 torch metadata 顯示 BSD-3-Clause。</Text></div>
                          <Text type="secondary">提供 MPS/CPU 推論與音訊張量處理基礎。</Text>
                          <Text type="secondary">保留第三方授權清單；升級版本時重跑 license audit。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>taibun</Text>
                            <Typography.Link href="https://github.com/andreihar/taibun" target="_blank">GitHub</Typography.Link>
                            <Typography.Link href="https://pypi.org/project/taibun/" target="_blank">PyPI</Typography.Link>
                          </div>
                          <div><Tag color="success">MIT</Tag><Text type="secondary">本機套件 metadata 顯示 MIT。</Text></div>
                          <Text type="secondary">台語文字轉台羅拼音，供字幕、分段檢視與校稿使用。</Text>
                          <Text type="secondary">保留套件版本與授權；台羅結果仍允許人工修正。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>jieba</Text>
                            <Typography.Link href="https://github.com/fxsjy/jieba" target="_blank">GitHub</Typography.Link>
                            <Typography.Link href="https://pypi.org/project/jieba/" target="_blank">PyPI</Typography.Link>
                          </div>
                          <div><Tag color="success">MIT</Tag><Text type="secondary">本機套件 metadata 顯示 MIT。</Text></div>
                          <Text type="secondary">中文分詞，從稿件產生詞語資料庫候選詞。</Text>
                          <Text type="secondary">分詞只作候選；需搭配人工評分與回報降低錯詞進入資料庫。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>FastAPI / Uvicorn</Text>
                            <Typography.Link href="https://fastapi.tiangolo.com/" target="_blank">FastAPI</Typography.Link>
                            <Typography.Link href="https://www.uvicorn.org/" target="_blank">Uvicorn</Typography.Link>
                          </div>
                          <div><Tag color="success">開源依賴</Tag><Text type="secondary">以套件 metadata 與官方 repository 為準。</Text></div>
                          <Text type="secondary">API、工作佇列、檔案下載、登入與管理端點。</Text>
                          <Text type="secondary">部署版本固定；升級前檢查授權與安全更新。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>React / Ant Design / Vite</Text>
                            <Typography.Link href="https://react.dev/" target="_blank">React</Typography.Link>
                            <Typography.Link href="https://ant.design/" target="_blank">Ant Design</Typography.Link>
                            <Typography.Link href="https://vite.dev/" target="_blank">Vite</Typography.Link>
                          </div>
                          <div><Tag color="success">MIT / Apache-2.0</Tag><Text type="secondary">本機 npm metadata：React、Ant Design、Vite 為 MIT；TypeScript 為 Apache-2.0。</Text></div>
                          <Text type="secondary">Web UI、表單、評分、分頁、統計與來源授權頁。</Text>
                          <Text type="secondary">保留前端依賴版本；公開部署前建立 dependency notice。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>FFmpeg / FFprobe</Text>
                            <Typography.Link href="https://ffmpeg.org/" target="_blank">FFmpeg</Typography.Link>
                            <Typography.Link href="https://ffmpeg.org/legal.html" target="_blank">Legal</Typography.Link>
                            <Typography.Link href="https://formulae.brew.sh/formula/ffmpeg" target="_blank">Homebrew formula</Typography.Link>
                          </div>
                          <div>
                            <Tag color="warning">GPL-3.0-or-later build</Tag>
                            <Text type="secondary">
                              目前部署使用 /opt/homebrew/bin/ffmpeg 8.1；Homebrew formula 標示 GPL-3.0-or-later。
                              編譯參數包含 --enable-gpl、libx264、libx265，未見 --enable-nonfree。
                            </Text>
                          </div>
                          <Text type="secondary">
                            Server-side only：合併音訊、讀取時長、使用 libx264/aac 輸出字幕波形 mp4；目前未把 FFmpeg binary 提供下載或包進前端。
                          </Text>
                          <Text type="secondary">
                            短期：保留版本、路徑、Homebrew formula、編譯參數與 Legal 連結。長期若要降低散布義務，改建 LGPL-only FFmpeg 並避免 libx264/libx265，例如改用可接受的系統 encoder。
                          </Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>SQLite / PostgreSQL</Text>
                            <Typography.Link href="https://www.sqlite.org/copyright.html" target="_blank">SQLite copyright</Typography.Link>
                            <Typography.Link href="https://www.postgresql.org/about/licence/" target="_blank">PostgreSQL license</Typography.Link>
                          </div>
                          <div><Tag color="success">資料儲存工具</Tag><Text type="secondary">SQLite public domain；PostgreSQL 使用 PostgreSQL License。</Text></div>
                          <Text type="secondary">保存 Jobs、詞語、評分、統計、匿名暱稱與備份匯出。</Text>
                          <Text type="secondary">資料庫內每筆外部匯入資料需保留 source、license、retrieved_at 欄位。</Text>
                        </div>
                      </div>
                    </div>

                    <div className="source-section">
                      <Title level={4}>辭源、固定語句與公開資料庫</Title>
                      <div className="source-table">
                        <div className="source-row source-row-head">
                          <Text strong>來源</Text>
                          <Text strong>授權/狀態</Text>
                          <Text strong>本站用途</Text>
                          <Text strong>治理動作</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>內建種子語詞</Text>
                            <Text type="secondary">逐家好、歹勢、毋免客氣、食果子拜樹頭等。</Text>
                          </div>
                          <div><Tag color="processing">本站整理</Tag><Text type="secondary">人工整理的起始資料。</Text></div>
                          <Text type="secondary">作為查詢、測試、分詞與語音生成的初始詞庫。</Text>
                          <Text type="secondary">每筆保留建立者、建立時間、後續修正與評分紀錄。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>使用者查詢、生成、評分與修正</Text>
                            <Text type="secondary">本站使用過程自然累積。</Text>
                          </div>
                          <div><Tag color="processing">使用者貢獻</Tag><Text type="secondary">需在服務條款明示可用於改善本站資料庫。</Text></div>
                          <Text type="secondary">建立轉譯記憶、語詞資料庫、音訊版本排序與品質評分。</Text>
                          <Text type="secondary">匿名者保留匿名暱稱與歷史；登入者保留 email 識別；允許更改自己的評分。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>教育部臺灣台語常用詞辭典</Text>
                            <Typography.Link href="https://sutian.moe.edu.tw/" target="_blank">辭典首頁</Typography.Link>
                            <Typography.Link href="https://sutian.moe.edu.tw/zh-hant/hunshiong/" target="_blank">資料下載/附錄</Typography.Link>
                          </div>
                          <div><Tag color="warning">待正式確認</Tag><Text type="secondary">可公開查詢與下載，但批次匯入、商用與再散布條件需逐項確認。</Text></div>
                          <Text type="secondary">目前只作人工校稿與查詞參考，不自動大量匯入本站 SQLite。</Text>
                          <Text type="secondary">正式匯入前記錄授權條款、下載日期、版本、引用文字與可否再散布。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>ChhoeTaigi / iTaigi 類型社群資源</Text>
                            <Typography.Link href="https://chhoe.taigi.info/" target="_blank">ChhoeTaigi</Typography.Link>
                            <Typography.Link href="https://itaigi.tw/" target="_blank">iTaigi</Typography.Link>
                            <Typography.Link href="https://github.com/ChhoeTaigi/ChhoeTaigiDatabase" target="_blank">ChhoeTaigiDatabase</Typography.Link>
                          </div>
                          <div><Tag color="warning">待資料集逐項確認</Tag><Text type="secondary">不同子資料來源可能有不同授權。</Text></div>
                          <Text type="secondary">作為人工查詞、比較譯法與候選語詞整理參考。</Text>
                          <Text type="secondary">若要匯入，需只匯入授權明確且允許本站用途的子集，並保留 source_id。</Text>
                        </div>
                        <div className="source-row">
                          <div>
                            <Text strong>其他公開辭典、論文、語料與新聞內容</Text>
                            <Text type="secondary">未列入本站自動資料源。</Text>
                          </div>
                          <div><Tag color="error">預設不得匯入</Tag><Text type="secondary">除非授權條款明確允許。</Text></div>
                          <Text type="secondary">可供人類查閱後撰寫自己的修正，但不直接爬取或複製進資料庫。</Text>
                          <Text type="secondary">新增來源前需通過授權欄位審核：license、commercial_use、redistribution、attribution。</Text>
                        </div>
                      </div>
                    </div>

                    <Alert
                      type="warning"
                      showIcon
                      message="公開營運前的資料治理規則"
                      description="正式匯入外部資料前，每筆來源都要有 source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required 與 notes。未確認可再利用的資料只能做人工查詢參考，不批次匯入、不提供下載、不混入本站自有詞庫。"
                    />
                  </Space>
                </Card>

                <Card className="lexicon-card">
                  <Flex align="center" justify="space-between" className="card-title" gap={12}>
                    <Title level={3} style={{ margin: 0 }}>{t('lexiconTitle')}</Title>
                    <Text type="secondary">{words.length} shown</Text>
                  </Flex>
                  <Input.Search
                    allowClear
                    placeholder={t('lexiconSearch')}
                    value={wordQuery}
                    onChange={(event) => setWordQuery(event.target.value)}
                    onSearch={(value) => loadWords(value)}
                    style={{ marginBottom: 12 }}
                  />
                  {words.length === 0 ? (
                    <Alert type="info" showIcon message={t('lexiconEmpty')} />
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {words.map((word) => (
                        <div key={word.id} className={`word-row ${word.problem ? 'has-problem' : ''}`}>
                          <Flex align="start" justify="space-between" gap={10}>
                            <div>
                              <Text strong>{word.source}</Text>
                              <Tag color={word.kind === 'phrase' ? 'purple' : 'blue'} style={{ marginLeft: 8 }}>
                                {word.category || (word.kind === 'phrase' ? '固定語句' : '詞語')}
                              </Tag>
                              <br />
                              <Text>{word.taigi}</Text>
                              <br />
                              <Text type="secondary">{word.tailo}</Text>
                              {!!word.play_count && (
                                <>
                                  <br />
                                  <Text type="secondary">播放 {word.play_count} 次</Text>
                                </>
                              )}
                              {!!word.rating_count && (
                                <>
                                  <br />
                                  <Text type="secondary">
                                    平均 {word.rating_average?.toFixed(1)} / 5（{word.rating_count} 票）
                                  </Text>
                                </>
                              )}
                              {word.note && (
                                <>
                                  <br />
                                  <Text type="secondary">{word.note}</Text>
                                </>
                              )}
                            </div>
                            <Tag color={word.problem ? 'error' : 'blue'}>{word.count}</Tag>
                          </Flex>
                          {word.problem && (
                            <Text type="danger">{word.problem_reason || '已標記需要重新產生'}</Text>
                          )}
                          {word.generation_status && ['queued', 'running', 'failed'].includes(word.generation_status) && (
                            <Alert
                              type={word.generation_status === 'failed' ? 'error' : 'info'}
                              showIcon
                              message={word.generation_stage || '詞語語音生成狀態'}
                              description={word.generation_status === 'queued' && word.generation_position ? `目前排第 ${word.generation_position} 個。` : word.generation_error}
                            />
                          )}
                          {word.multilingual && Object.keys(word.multilingual).length > 0 && (
                            <div className="word-corpus-panel">
                              <Text strong>{t('multilingualCorpus')}</Text>
                              <div className="word-corpus-grid">
                                {UI_LANGUAGES.map((lang) => {
                                  const item = word.multilingual?.[lang.value];
                                  return (
                                    <div key={lang.value} className={item?.status === 'pending' ? 'is-pending' : ''}>
                                      <Flex align="center" justify="space-between" gap={6}>
                                        <Text strong>{UI_LANGUAGE_LABELS[lang.value]}</Text>
                                        <Tag color={item?.status === 'pending' ? 'warning' : 'processing'}>
                                          {item?.status === 'pending' ? t('pendingReview') : item ? t('draft') : 'none'}
                                        </Tag>
                                      </Flex>
                                      <Text type={item?.text ? undefined : 'secondary'}>
                                        {item?.text || item?.note || '等待補稿'}
                                      </Text>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {(word.assets ?? []).length > 0 && (
                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                              {(word.assets ?? []).map((asset, index) => (
                                <div key={asset.id} className="word-asset-row">
                                  <Flex align="center" justify="space-between" gap={10} wrap>
                                    <Space size={8} wrap>
                                      <Tag color={index === 0 ? 'gold' : 'blue'}>{index === 0 ? '目前最高排序' : `版本 ${index + 1}`}</Tag>
                                      <Text type="secondary">
                                        {asset.generated_by_name || '匿名使用者'} · {asset.created_at ? formatTime(asset.created_at) : '未知時間'}
                                      </Text>
                                      {!!asset.rating_count && (
                                        <Text type="secondary">平均 {asset.rating_average?.toFixed(1)} / 5（{asset.rating_count} 票）</Text>
                                      )}
                                      {!!asset.play_count && <Text type="secondary">播放 {asset.play_count} 次</Text>}
                                    </Space>
                                    <Rate value={asset.my_rating ?? 0} onChange={(rating) => rateWordAsset(word, asset, rating)} />
                                  </Flex>
                                  {asset.has_audio && (
                                    <div>
                                      <audio
                                        controls
                                        preload="none"
                                        src={`/words/${word.id}/assets/${asset.id}/download/audio`}
                                        style={{ width: '100%', marginTop: 8 }}
                                      />
                                      <Space size={8} wrap className="share-actions">
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`word:${word.id}:${asset.id}:audio`, word.source, 'copy')}>複製音訊連結</Button>
                                        <Button size="small" onClick={() => shareMedia(`word:${word.id}:${asset.id}:audio`, word.source, 'line')}>LINE</Button>
                                        <Button size="small" onClick={() => shareMedia(`word:${word.id}:${asset.id}:audio`, word.source, 'facebook')}>Facebook</Button>
                                      </Space>
                                    </div>
                                  )}
                                  {asset.has_video && (
                                    <div>
                                      <video
                                        controls
                                        preload="metadata"
                                        src={`/words/${word.id}/assets/${asset.id}/download/video`}
                                        style={{ width: '100%', marginTop: 8, borderRadius: 8, background: '#111' }}
                                      />
                                      <Space size={8} wrap className="share-actions">
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`word:${word.id}:${asset.id}:video`, word.source, 'copy')}>複製影片連結</Button>
                                        <Button size="small" onClick={() => shareMedia(`word:${word.id}:${asset.id}:video`, word.source, 'line')}>LINE</Button>
                                        <Button size="small" onClick={() => shareMedia(`word:${word.id}:${asset.id}:video`, word.source, 'facebook')}>Facebook</Button>
                                      </Space>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </Space>
                          )}
                          <Flex align="center" justify="space-between" gap={10} wrap>
                            <Flex align="center" gap={8} wrap>
                              <Text type="secondary">{t('rateAudio')}</Text>
                              <Rate value={word.my_rating ?? 0} onChange={(rating) => rateWord(word, rating)} />
                            </Flex>
                            <Space size={8} wrap>
                              <Button size="small" type={word.problem ? 'primary' : 'default'} onClick={() => generateWordAudio(word)}>
                                {word.problem ? t('regenerateWord') : t('generateWord')}
                              </Button>
                              <Button size="small" onClick={() => reportWordIssue(word)}>
                                {t('reportIssue')}
                              </Button>
                              <Button size="small" onClick={() => requestWordCorpus(word)}>
                                {t('requestCorpus')}
                              </Button>
                            </Space>
                          </Flex>
                        </div>
                      ))}
                    </Space>
                  )}
                </Card>

                <Card className="jobs-card">
                  <Flex align="center" justify="space-between" className="card-title">
                    <Title level={3} style={{ margin: 0 }}>{t('jobs')}</Title>
                    <Text type="secondary">{jobs.length} 筆</Text>
                  </Flex>
                  {jobs.length === 0 ? (
                    <Alert type="info" showIcon message={signedIn ? '目前沒有工作' : '目前沒有已完成的公開工作'} />
                  ) : (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      {jobGroups.map((group) => (
                        <div key={group.key} className="job-group">
                          <Flex align="center" justify="space-between" className="job-group-title">
                            <Text strong>{group.label}</Text>
                            <Tag>{group.jobs.length}</Tag>
                          </Flex>
                          {group.jobs.length === 0 ? (
                            <Text type="secondary">沒有{group.label}的工作。</Text>
                          ) : (
                            group.jobs.map((job) => (
                              <div
                                key={job.id}
                                className={`job-row ${selectedJob?.id === job.id ? 'is-selected' : ''}`}
                              >
                                <button className="job-row-main" onClick={() => openJobInWorkTab(job.id)}>
                                  <div className="job-row-name">
                                    <Text strong ellipsis>{jobDisplayTitle(job)}</Text>
                                    <Tag color={job.kind === 'word_asset' ? 'purple' : 'cyan'}>
                                      {job.kind === 'word_asset' ? t('jobKindWord') : t('jobKindScript')}
                                    </Tag>
                                    <Tag color={statusColor[job.status]}>{job.status}</Tag>
                                  </div>
                                  <Progress percent={job.progress} size="small" showInfo={false} />
                                  <PipelineStrip job={job} compact />
                                  <Text type="secondary">
                                    {job.stage} · {formatTime(job.updated_at)}
                                    {formatDuration(job.elapsed_seconds) ? ` · 耗時 ${formatDuration(job.elapsed_seconds)}` : ''}
                                    {job.rating_count ? ` · 平均 ${job.rating_average?.toFixed(1)} / 5（${job.rating_count} 票）` : ''}
                                    {job.play_count ? ` · 播放 ${job.play_count} 次` : ''}
                                  </Text>
                                </button>
                                {job.status === 'complete' && (
                                  <Flex align="center" justify="space-between" gap={10} wrap className="job-row-actions">
                                    <Flex align="center" gap={8} wrap>
                                      <Text type="secondary">我的評分</Text>
                                      <Rate value={job.my_rating ?? 0} onChange={(rating) => rateJob(job, rating)} />
                                    </Flex>
                                    <Space size={8} wrap>
                                      <Button size="small" onClick={() => openJobInWorkTab(job.id)}>查看播放與分段</Button>
                                      {isAdmin && (
                                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteJob(job)}>
                                          刪除
                                        </Button>
                                      )}
                                    </Space>
                                  </Flex>
                                )}
                                {job.status === 'failed' && isAdmin && (
                                  <Flex justify="flex-end" className="job-row-actions">
                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteJob(job)}>
                                      刪除失敗工作
                                    </Button>
                                  </Flex>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </Space>
                  )}
                </Card>
              </Space>
            </div>
        </Content>

        <Footer style={{ textAlign: 'center', color: '#6e6e73' }}>
          Private local tool for VoxCPM Taiwanese Hokkien voice/video generation.
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
