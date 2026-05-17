import { useEffect, useMemo, useRef, useState } from 'react';
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
const STATIC_DATA_BASE = ((import.meta.env.VITE_STATIC_DATA_BASE_URL as string | undefined) || '/static-data/public').replace(/\/$/, '');

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
    lexiconQualityTitle: '語詞資料庫品質',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '評分',
    lexiconTitle: '語詞與固定語句資料庫',
    lexiconSearch: '查詢中文、台語、台羅、俗語、成語',
    lexiconEmpty: '目前沒有符合的詞語',
    requestNewWord: '申請新增詞料',
    requestNewWordHint: '查不到這個詞語，可以送出新增申請，讓系統記錄待整理的台語詞料。',
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
    lexiconQualityTitle: '词语数据库质量',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '评分',
    lexiconTitle: '词语与固定语句数据库',
    lexiconSearch: '查询中文、台语、台罗、俗语、成语',
    lexiconEmpty: '目前没有符合的词语',
    requestNewWord: '申请新增词料',
    requestNewWordHint: '查不到这个词语，可以送出新增申请，让系统记录待整理的台语词料。',
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
    lexiconQualityTitle: 'Lexicon Quality',
    dailyPlay: 'Plays',
    dailyShare: 'Shares',
    dailyRate: 'Ratings',
    lexiconTitle: 'Words and Fixed Phrases',
    lexiconSearch: 'Search Chinese, Taigi, Tailo, idioms, phrases',
    lexiconEmpty: 'No matching entries',
    requestNewWord: 'Request new entry',
    requestNewWordHint: 'No match found. You can request a new lexicon entry for review.',
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
    lexiconQualityTitle: '語彙データ品質',
    dailyPlay: '再生',
    dailyShare: '共有',
    dailyRate: '評価',
    lexiconTitle: '語彙と定型句データベース',
    lexiconSearch: '中国語、台湾語、台羅、慣用句を検索',
    lexiconEmpty: '一致する語彙はありません',
    requestNewWord: '新規語彙を申請',
    requestNewWordHint: '見つからない語彙は、新規候補として申請できます。',
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
    lexiconQualityTitle: '어휘 데이터 품질',
    dailyPlay: '재생',
    dailyShare: '공유',
    dailyRate: '평점',
    lexiconTitle: '어휘 및 고정 표현 데이터베이스',
    lexiconSearch: '중국어, 대만어, Tailo, 관용구 검색',
    lexiconEmpty: '일치하는 항목이 없습니다',
    requestNewWord: '새 어휘 신청',
    requestNewWordHint: '찾을 수 없는 어휘는 새 후보로 신청할 수 있습니다.',
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
    lexiconQualityTitle: '語詞資料庫品質',
    dailyPlay: '播放',
    dailyShare: '分享',
    dailyRate: '評分',
    lexiconTitle: '語詞佮固定語句資料庫',
    lexiconSearch: '查中文、台語、台羅、俗語、成語',
    lexiconEmpty: '目前無符合的語詞',
    requestNewWord: '申請新增詞料',
    requestNewWordHint: '查無這个語詞，會使送出新增申請，予系統記錄待整理的台語詞料。',
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
    lexiconQualityTitle: 'Gí-sû tsu-liāu-khòo phín-tsit',
    dailyPlay: 'Pòo-hòng',
    dailyShare: 'Hun-hióng',
    dailyRate: 'Phîng-hun',
    lexiconTitle: 'Gí-sû kap kòo-tīng gí-kù tsu-liāu-khòo',
    lexiconSearch: 'Tshiau Tiong-bûn, Tâi-gí, Tâi-lô, sio̍k-gí',
    lexiconEmpty: 'Bô ha̍p ê gí-sû',
    requestNewWord: 'Tshing-kiû sin gí-liāu',
    requestNewWordHint: 'Tshiau bô gí-sû ê sî, ē-tàng tshing-kiû tsò sin ê hāu-suán.',
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
    request_source_export: '申請多語系資料匯出',
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
    request_source_export: '申请多语系资料导出',
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
    request_source_export: 'Multilingual data export requests',
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
    request_source_export: '多言語データ出力申請',
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
    request_source_export: '다국어 데이터 내보내기 신청',
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
    request_source_export: '申請多語系資料匯出',
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
    request_source_export: 'Tshing-kiû tō-gí-hē tsu-liāu huī-tshut',
    anonymous_nickname_change: 'Kái bû-miâ phiau-hō',
  },
};

type SourceRowKey =
  | 'voxcpm'
  | 'pytorch'
  | 'taibun'
  | 'jieba'
  | 'fastapi'
  | 'frontend'
  | 'ffmpeg'
  | 'storage'
  | 'seed'
  | 'userContribution'
  | 'moe'
  | 'chhoeTaigi'
  | 'external';

interface SourceCopy {
  intro: string;
  governanceTitle: string;
  governanceTags: Array<{ color: string; label: string }>;
  governanceItems: Array<{ title: string; description: string }>;
  toolsTitle: string;
  dictionariesTitle: string;
  columns: {
    source: string;
    status: string;
    usage: string;
    governance: string;
  };
  rows: Record<SourceRowKey, {
    statusTag: string;
    status: string;
    usage: string;
    governance: string;
  }>;
  rowNames?: Partial<Record<SourceRowKey, { name: string; note?: string }>>;
  alertTitle: string;
  alertDescription: string;
}

const SOURCE_ROW_CONFIG: Array<{
  key: SourceRowKey;
  section: 'tools' | 'dictionaries';
  name: string;
  links?: Array<{ label: string; href: string }>;
  note?: string;
  color: string;
}> = [
  {
    key: 'voxcpm',
    section: 'tools',
    name: 'VoxCPM / VoxCPM2',
    color: 'success',
    links: [
      { label: 'GitHub', href: 'https://github.com/OpenBMB/VoxCPM' },
      { label: 'Hugging Face model', href: 'https://huggingface.co/openbmb/VoxCPM2' },
    ],
  },
  {
    key: 'pytorch',
    section: 'tools',
    name: 'PyTorch / torchaudio',
    color: 'success',
    links: [
      { label: 'PyTorch', href: 'https://pytorch.org/' },
      { label: 'torchaudio', href: 'https://github.com/pytorch/audio' },
    ],
  },
  {
    key: 'taibun',
    section: 'tools',
    name: 'taibun',
    color: 'success',
    links: [
      { label: 'GitHub', href: 'https://github.com/andreihar/taibun' },
      { label: 'PyPI', href: 'https://pypi.org/project/taibun/' },
    ],
  },
  {
    key: 'jieba',
    section: 'tools',
    name: 'jieba',
    color: 'success',
    links: [
      { label: 'GitHub', href: 'https://github.com/fxsjy/jieba' },
      { label: 'PyPI', href: 'https://pypi.org/project/jieba/' },
    ],
  },
  {
    key: 'fastapi',
    section: 'tools',
    name: 'FastAPI / Uvicorn',
    color: 'success',
    links: [
      { label: 'FastAPI', href: 'https://fastapi.tiangolo.com/' },
      { label: 'Uvicorn', href: 'https://www.uvicorn.org/' },
    ],
  },
  {
    key: 'frontend',
    section: 'tools',
    name: 'React / Ant Design / Vite',
    color: 'success',
    links: [
      { label: 'React', href: 'https://react.dev/' },
      { label: 'Ant Design', href: 'https://ant.design/' },
      { label: 'Vite', href: 'https://vite.dev/' },
    ],
  },
  {
    key: 'ffmpeg',
    section: 'tools',
    name: 'FFmpeg / FFprobe',
    color: 'warning',
    links: [
      { label: 'FFmpeg', href: 'https://ffmpeg.org/' },
      { label: 'Legal', href: 'https://ffmpeg.org/legal.html' },
      { label: 'Homebrew formula', href: 'https://formulae.brew.sh/formula/ffmpeg' },
    ],
  },
  {
    key: 'storage',
    section: 'tools',
    name: 'SQLite / PostgreSQL',
    color: 'success',
    links: [
      { label: 'SQLite copyright', href: 'https://www.sqlite.org/copyright.html' },
      { label: 'PostgreSQL license', href: 'https://www.postgresql.org/about/licence/' },
    ],
  },
  {
    key: 'seed',
    section: 'dictionaries',
    name: '內建種子語詞',
    note: '逐家好、歹勢、毋免客氣、食果子拜樹頭等。',
    color: 'processing',
  },
  {
    key: 'userContribution',
    section: 'dictionaries',
    name: '使用者查詢、生成、評分與修正',
    note: '本站使用過程自然累積。',
    color: 'processing',
  },
  {
    key: 'moe',
    section: 'dictionaries',
    name: '教育部臺灣台語常用詞辭典',
    color: 'warning',
    links: [
      { label: '辭典首頁', href: 'https://sutian.moe.edu.tw/' },
      { label: '資料下載/附錄', href: 'https://sutian.moe.edu.tw/zh-hant/hunshiong/' },
    ],
  },
  {
    key: 'chhoeTaigi',
    section: 'dictionaries',
    name: 'ChhoeTaigi / iTaigi 類型社群資源',
    color: 'warning',
    links: [
      { label: 'ChhoeTaigi', href: 'https://chhoe.taigi.info/' },
      { label: 'iTaigi', href: 'https://itaigi.tw/' },
      { label: 'ChhoeTaigiDatabase', href: 'https://github.com/ChhoeTaigi/ChhoeTaigiDatabase' },
    ],
  },
  {
    key: 'external',
    section: 'dictionaries',
    name: '其他公開辭典、論文、語料與新聞內容',
    note: '未列入本站自動資料源。',
    color: 'error',
  },
];

const SOURCE_COPY: Record<UiLanguage, SourceCopy> = {
  'zh-Hant': {
    intro: '這裡按照公開營運前的授權治理建議，記錄每個工具、模型、辭源與公開資料庫的來源、授權狀態、本站用途與治理動作。「待確認」的資料只做人工查詢或校稿參考，不直接批次匯入、再散布或作為可下載資料庫。',
    governanceTitle: '授權狀態分類',
    governanceTags: [
      { color: 'success', label: '可納入系統依賴' },
      { color: 'processing', label: '本站自有/使用者貢獻' },
      { color: 'warning', label: '待確認後再匯入' },
      { color: 'error', label: '不得匯入' },
    ],
    governanceItems: [
      { title: '可納入系統依賴', description: '開源授權明確，可作為程式、模型或工具使用；仍需保留授權文字與來源連結。' },
      { title: '本站自有/使用者貢獻', description: '由本站建立或使用者回饋產生，需在服務條款中說明投稿資料可被用於改進轉譯與語音生成。' },
      { title: '待確認後再匯入', description: '可人工參考，但正式匯入 SQLite、開放查詢或輸出檔案前，需要確認可商用、可改作、可再散布與署名條件。' },
      { title: '不得匯入', description: '沒有可再利用授權、禁止爬取、禁止商用或只允許個人瀏覽的資料，不放入本站資料庫。' },
    ],
    toolsTitle: '模型、工具與框架',
    dictionariesTitle: '辭源、固定語句與公開資料庫',
    columns: { source: '來源', status: '授權/狀態', usage: '本站用途', governance: '治理動作' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: '本機 README、LICENSE、pyproject 均標示 Apache-2.0。', usage: '依台語稿與參考聲音產生 wav 語音，並供影片流程使用。', governance: '保留 LICENSE；公開頁標示 AI 生成；禁止冒名、詐欺、誤導用途。' },
      pytorch: { statusTag: 'BSD-style', status: '本機 torch metadata 顯示 BSD-3-Clause。', usage: '提供 MPS/CPU 推論與音訊張量處理基礎。', governance: '保留第三方授權清單；升級版本時重跑 license audit。' },
      taibun: { statusTag: 'MIT', status: '本機套件 metadata 顯示 MIT。', usage: '台語文字轉台羅拼音，供字幕、分段檢視與校稿使用。', governance: '保留套件版本與授權；台羅結果仍允許人工修正。' },
      jieba: { statusTag: 'MIT', status: '本機套件 metadata 顯示 MIT。', usage: '中文分詞，從稿件產生詞語資料庫候選詞。', governance: '分詞只作候選；需搭配人工評分與回報降低錯詞進入資料庫。' },
      fastapi: { statusTag: '開源依賴', status: '以套件 metadata 與官方 repository 為準。', usage: 'API、工作佇列、檔案下載、登入與管理端點。', governance: '部署版本固定；升級前檢查授權與安全更新。' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: '本機 npm metadata：React、Ant Design、Vite 為 MIT；TypeScript 為 Apache-2.0。', usage: 'Web UI、表單、評分、分頁、統計與來源授權頁。', governance: '保留前端依賴版本；公開部署前建立 dependency notice。' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: '目前部署使用 /opt/homebrew/bin/ffmpeg 8.1；Homebrew formula 標示 GPL-3.0-or-later。編譯參數包含 --enable-gpl、libx264、libx265，未見 --enable-nonfree。', usage: 'Server-side only：合併音訊、讀取時長、使用 libx264/aac 輸出字幕波形 mp4；目前未把 FFmpeg binary 提供下載或包進前端。', governance: '短期保留版本、路徑、formula、編譯參數與 Legal 連結。長期若要降低散布義務，改建 LGPL-only FFmpeg 並避免 libx264/libx265。' },
      storage: { statusTag: '資料儲存工具', status: 'SQLite public domain；PostgreSQL 使用 PostgreSQL License。', usage: '保存 Jobs、詞語、評分、統計、匿名暱稱與備份匯出。', governance: '資料庫內每筆外部匯入資料需保留 source、license、retrieved_at 欄位。' },
      seed: { statusTag: '本站整理', status: '人工整理的起始資料。', usage: '作為查詢、測試、分詞與語音生成的初始詞庫。', governance: '每筆保留建立者、建立時間、後續修正與評分紀錄。' },
      userContribution: { statusTag: '使用者貢獻', status: '需在服務條款明示可用於改善本站資料庫。', usage: '建立轉譯記憶、語詞資料庫、音訊版本排序與品質評分。', governance: '匿名者保留匿名暱稱與歷史；登入者保留 email 識別；允許更改自己的評分。' },
      moe: { statusTag: '待正式確認', status: '可公開查詢與下載，但批次匯入、商用與再散布條件需逐項確認。', usage: '目前只作人工校稿與查詞參考，不自動大量匯入本站 SQLite。', governance: '正式匯入前記錄授權條款、下載日期、版本、引用文字與可否再散布。' },
      chhoeTaigi: { statusTag: '待資料集逐項確認', status: '不同子資料來源可能有不同授權。', usage: '作為人工查詞、比較譯法與候選語詞整理參考。', governance: '若要匯入，需只匯入授權明確且允許本站用途的子集，並保留 source_id。' },
      external: { statusTag: '預設不得匯入', status: '除非授權條款明確允許。', usage: '可供人類查閱後撰寫自己的修正，但不直接爬取或複製進資料庫。', governance: '新增來源前需通過授權欄位審核：license、commercial_use、redistribution、attribution。' },
    },
    rowNames: {
      seed: { name: '內建種子語詞', note: '逐家好、歹勢、毋免客氣、食果子拜樹頭等。' },
      userContribution: { name: '使用者查詢、生成、評分與修正', note: '本站使用過程自然累積。' },
      moe: { name: '教育部臺灣台語常用詞辭典' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi 類型社群資源' },
      external: { name: '其他公開辭典、論文、語料與新聞內容', note: '未列入本站自動資料源。' },
    },
    alertTitle: '公開營運前的資料治理規則',
    alertDescription: '正式匯入外部資料前，每筆來源都要有 source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required 與 notes。未確認可再利用的資料只能做人工查詢參考，不批次匯入、不提供下載、不混入本站自有詞庫。',
  },
  'zh-Hans': {
    intro: '这里按照公开运营前的授权治理建议，记录每个工具、模型、辞源与公开数据库的来源、授权状态、本站用途与治理动作。“待确认”的资料只做人工查询或校稿参考，不直接批量导入、再散布或作为可下载数据库。',
    governanceTitle: '授权状态分类',
    governanceTags: [
      { color: 'success', label: '可纳入系统依赖' },
      { color: 'processing', label: '本站自有/用户贡献' },
      { color: 'warning', label: '待确认后再导入' },
      { color: 'error', label: '不得导入' },
    ],
    governanceItems: [
      { title: '可纳入系统依赖', description: '开源授权明确，可作为程序、模型或工具使用；仍需保留授权文字与来源链接。' },
      { title: '本站自有/用户贡献', description: '由本站建立或用户反馈产生，需在服务条款中说明投稿资料可用于改进转译与语音生成。' },
      { title: '待确认后再导入', description: '可人工参考，但正式导入 SQLite、开放查询或输出文件前，需要确认可商用、可改作、可再散布与署名条件。' },
      { title: '不得导入', description: '没有可再利用授权、禁止爬取、禁止商用或只允许个人浏览的资料，不放入本站数据库。' },
    ],
    toolsTitle: '模型、工具与框架',
    dictionariesTitle: '辞源、固定语句与公开数据库',
    columns: { source: '来源', status: '授权/状态', usage: '本站用途', governance: '治理动作' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: '本机 README、LICENSE、pyproject 均标示 Apache-2.0。', usage: '依台语稿与参考声音产生 wav 语音，并供影片流程使用。', governance: '保留 LICENSE；公开页标示 AI 生成；禁止冒名、欺诈、误导用途。' },
      pytorch: { statusTag: 'BSD-style', status: '本机 torch metadata 显示 BSD-3-Clause。', usage: '提供 MPS/CPU 推论与音频张量处理基础。', governance: '保留第三方授权清单；升级版本时重跑 license audit。' },
      taibun: { statusTag: 'MIT', status: '本机套件 metadata 显示 MIT。', usage: '台语文字转台罗拼音，供字幕、分段检视与校稿使用。', governance: '保留套件版本与授权；台罗结果仍允许人工修正。' },
      jieba: { statusTag: 'MIT', status: '本机套件 metadata 显示 MIT。', usage: '中文分词，从稿件产生词语数据库候选词。', governance: '分词只作候选；需搭配人工评分与回报降低错词进入数据库。' },
      fastapi: { statusTag: '开源依赖', status: '以套件 metadata 与官方 repository 为准。', usage: 'API、工作队列、文件下载、登录与管理端点。', governance: '部署版本固定；升级前检查授权与安全更新。' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: '本机 npm metadata：React、Ant Design、Vite 为 MIT；TypeScript 为 Apache-2.0。', usage: 'Web UI、表单、评分、分页、统计与来源授权页。', governance: '保留前端依赖版本；公开部署前建立 dependency notice。' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: '目前部署使用 /opt/homebrew/bin/ffmpeg 8.1；Homebrew formula 标示 GPL-3.0-or-later。编译参数包含 --enable-gpl、libx264、libx265，未见 --enable-nonfree。', usage: 'Server-side only：合并音频、读取时长、使用 libx264/aac 输出字幕波形 mp4；目前未把 FFmpeg binary 提供下载或包进前端。', governance: '短期保留版本、路径、formula、编译参数与 Legal 链接。长期若要降低散布义务，改建 LGPL-only FFmpeg 并避免 libx264/libx265。' },
      storage: { statusTag: '资料储存工具', status: 'SQLite public domain；PostgreSQL 使用 PostgreSQL License。', usage: '保存 Jobs、词语、评分、统计、匿名昵称与备份导出。', governance: '数据库内每笔外部导入资料需保留 source、license、retrieved_at 字段。' },
      seed: { statusTag: '本站整理', status: '人工整理的起始资料。', usage: '作为查询、测试、分词与语音生成的初始词库。', governance: '每笔保留建立者、建立时间、后续修正与评分记录。' },
      userContribution: { statusTag: '用户贡献', status: '需在服务条款明示可用于改善本站数据库。', usage: '建立转译记忆、词语数据库、音频版本排序与质量评分。', governance: '匿名者保留匿名昵称与历史；登录者保留 email 识别；允许更改自己的评分。' },
      moe: { statusTag: '待正式确认', status: '可公开查询与下载，但批量导入、商用与再散布条件需逐项确认。', usage: '目前只作人工校稿与查词参考，不自动大量导入本站 SQLite。', governance: '正式导入前记录授权条款、下载日期、版本、引用文字与可否再散布。' },
      chhoeTaigi: { statusTag: '待资料集逐项确认', status: '不同子资料来源可能有不同授权。', usage: '作为人工查词、比较译法与候选词语整理参考。', governance: '若要导入，需只导入授权明确且允许本站用途的子集，并保留 source_id。' },
      external: { statusTag: '预设不得导入', status: '除非授权条款明确允许。', usage: '可供人类查阅后撰写自己的修正，但不直接爬取或复制进数据库。', governance: '新增来源前需通过授权字段审核：license、commercial_use、redistribution、attribution。' },
    },
    rowNames: {
      seed: { name: '内建种子词语', note: '逐家好、歹势、毋免客气、食果子拜树头等。' },
      userContribution: { name: '用户查询、生成、评分与修正', note: '本站使用过程中自然累积。' },
      moe: { name: '教育部台湾台语常用词辞典' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi 类型社群资源' },
      external: { name: '其他公开辞典、论文、语料与新闻内容', note: '未列入本站自动数据源。' },
    },
    alertTitle: '公开运营前的数据治理规则',
    alertDescription: '正式导入外部资料前，每笔来源都要有 source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required 与 notes。未确认可再利用的资料只能做人工查询参考，不批量导入、不提供下载、不混入本站自有词库。',
  },
  en: {
    intro: 'This ledger follows the pre-launch governance checklist. It records every tool, model, lexical source, and public dataset with its origin, license state, project usage, and required governance action. Pending sources are only used for manual lookup or review, not bulk-imported, redistributed, or exposed as downloadable data.',
    governanceTitle: 'License Status Classes',
    governanceTags: [
      { color: 'success', label: 'Allowed dependency' },
      { color: 'processing', label: 'First-party / user contributed' },
      { color: 'warning', label: 'Confirm before import' },
      { color: 'error', label: 'Do not import' },
    ],
    governanceItems: [
      { title: 'Allowed dependency', description: 'The open-source license is clear enough for code, model, or tool use; keep license text and source links.' },
      { title: 'First-party / user contributed', description: 'Created by this site or by user feedback. Terms must explain that submissions may improve translation and speech generation.' },
      { title: 'Confirm before import', description: 'Manual reference is acceptable, but SQLite import, public search, or output files require commercial-use, derivative-use, redistribution, and attribution checks.' },
      { title: 'Do not import', description: 'Data without reuse permission, data that forbids scraping or commercial use, or material only meant for personal browsing must stay out of the database.' },
    ],
    toolsTitle: 'Models, Tools, and Frameworks',
    dictionariesTitle: 'Lexical Sources, Fixed Phrases, and Public Datasets',
    columns: { source: 'Source', status: 'License / status', usage: 'Project usage', governance: 'Governance action' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: 'Local README, LICENSE, and pyproject declare Apache-2.0.', usage: 'Generates wav speech from Taigi text and a reference voice for the video pipeline.', governance: 'Keep LICENSE notices, label AI-generated output, and prohibit impersonation, fraud, and misleading use.' },
      pytorch: { statusTag: 'BSD-style', status: 'Local torch metadata reports BSD-3-Clause.', usage: 'Provides MPS/CPU inference and audio tensor processing.', governance: 'Keep third-party notices and rerun license audit on upgrades.' },
      taibun: { statusTag: 'MIT', status: 'Local package metadata reports MIT.', usage: 'Converts Taigi text to Tailo romanization for captions, segment review, and correction.', governance: 'Keep package version and license; allow human correction of Tailo output.' },
      jieba: { statusTag: 'MIT', status: 'Local package metadata reports MIT.', usage: 'Chinese word segmentation for candidate lexicon extraction from scripts.', governance: 'Treat segmentation as candidates only; use ratings and issue reports before promoting entries.' },
      fastapi: { statusTag: 'Open-source dependency', status: 'Governed by package metadata and official repositories.', usage: 'APIs, job queue, file downloads, login, and admin endpoints.', governance: 'Pin deployed versions and review licenses and security updates before upgrades.' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: 'Local npm metadata: React, Ant Design, and Vite are MIT; TypeScript is Apache-2.0.', usage: 'Web UI, forms, ratings, tabs, statistics, and source governance page.', governance: 'Keep frontend dependency versions and prepare a dependency notice before public launch.' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: 'Current deployment uses /opt/homebrew/bin/ffmpeg 8.1. Homebrew formula is GPL-3.0-or-later. Build flags include --enable-gpl, libx264, and libx265; --enable-nonfree was not found.', usage: 'Server-side only: joins audio, probes duration, and renders captioned waveform mp4 with libx264/aac. The binary is not bundled or downloaded by the frontend.', governance: 'Short term: record version, path, formula, build flags, and legal links. Long term: consider an LGPL-only FFmpeg build and avoid libx264/libx265 if redistribution duties should be reduced.' },
      storage: { statusTag: 'Storage tools', status: 'SQLite is public domain; PostgreSQL uses the PostgreSQL License.', usage: 'Stores jobs, words, ratings, statistics, anonymous nicknames, and export backups.', governance: 'External imported rows must preserve source, license, and retrieved_at fields.' },
      seed: { statusTag: 'First-party curation', status: 'Manually curated starter data.', usage: 'Initial lexicon for search, tests, segmentation, and speech generation.', governance: 'Keep creator, creation time, later corrections, and rating history for each entry.' },
      userContribution: { statusTag: 'User contribution', status: 'Terms must explicitly allow use for improving the site database.', usage: 'Builds translation memory, lexicon entries, audio ranking, and quality scores.', governance: 'Keep anonymous nickname history, logged-in email identity, and editable per-user ratings.' },
      moe: { statusTag: 'Needs formal confirmation', status: 'Publicly searchable and downloadable, but bulk import, commercial use, and redistribution terms must be checked item by item.', usage: 'Manual proofreading and lookup reference only; no automatic bulk import into SQLite.', governance: 'Before import, record terms, download date, version, cited text, and redistribution permission.' },
      chhoeTaigi: { statusTag: 'Dataset-level review needed', status: 'Sub-sources may carry different licenses.', usage: 'Manual lookup, translation comparison, and candidate phrase research.', governance: 'Import only subsets with clear permission for this site and retain source_id.' },
      external: { statusTag: 'Do not import by default', status: 'Only allowed when license terms clearly permit reuse.', usage: 'Humans may read and write their own corrections; the system must not scrape or copy directly into the database.', governance: 'New sources must pass review for license, commercial_use, redistribution, and attribution.' },
    },
    rowNames: {
      seed: { name: 'Built-in seed lexicon', note: 'Examples include “逐家好”, “歹勢”, “毋免客氣”, and “食果子拜樹頭”.' },
      userContribution: { name: 'User searches, generations, ratings, and corrections', note: 'Accumulated naturally while the site is used.' },
      moe: { name: 'MOE Dictionary of Frequently-Used Taiwanese Taigi' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi community resources' },
      external: { name: 'Other public dictionaries, papers, corpora, and news content', note: 'Not configured as automatic data sources for this site.' },
    },
    alertTitle: 'Pre-launch Data Governance Rule',
    alertDescription: 'Before any external source is imported, every source needs source_url, license_name, license_url, retrieved_at, version, commercial_use, redistribution, attribution_required, and notes. Unconfirmed reusable data is manual-reference only: no bulk import, no download export, and no mixing into the first-party lexicon.',
  },
  ja: {
    intro: 'この台帳は公開運用前のライセンス管理方針に沿って、各ツール、モデル、語彙出典、公開データベースの出典、ライセンス状態、サイト内での用途、必要な管理措置を記録します。「確認待ち」の資料は手作業の参照や校正だけに使い、一括取り込み、再配布、ダウンロード可能なデータベース化はしません。',
    governanceTitle: 'ライセンス状態の分類',
    governanceTags: [
      { color: 'success', label: '依存関係として利用可' },
      { color: 'processing', label: '自サイト/ユーザー投稿' },
      { color: 'warning', label: '確認後に取り込み' },
      { color: 'error', label: '取り込み不可' },
    ],
    governanceItems: [
      { title: '依存関係として利用可', description: 'オープンソースライセンスが明確で、コード、モデル、ツールとして利用可能。ライセンス文と出典リンクは保持します。' },
      { title: '自サイト/ユーザー投稿', description: 'サイト作成またはユーザーのフィードバック由来。投稿データを翻訳と音声生成の改善に使えることを規約で明示します。' },
      { title: '確認後に取り込み', description: '手作業の参照は可能ですが、SQLite 取り込み、公開検索、出力ファイル化には商用利用、改変、再配布、表示条件の確認が必要です。' },
      { title: '取り込み不可', description: '再利用許諾がない、クローリングや商用利用が禁止、個人閲覧のみの資料はデータベースに入れません。' },
    ],
    toolsTitle: 'モデル、ツール、フレームワーク',
    dictionariesTitle: '語彙出典、定型句、公開データベース',
    columns: { source: '出典', status: 'ライセンス/状態', usage: 'サイトでの用途', governance: '管理措置' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: 'ローカルの README、LICENSE、pyproject は Apache-2.0 を示しています。', usage: '台湾語文と参照音声から wav 音声を生成し、動画処理に使います。', governance: 'LICENSE を保持し、AI 生成であることを表示し、なりすまし、詐欺、誤認用途を禁止します。' },
      pytorch: { statusTag: 'BSD-style', status: 'ローカル torch metadata は BSD-3-Clause を示しています。', usage: 'MPS/CPU 推論と音声テンソル処理の基盤です。', governance: '第三者ライセンス一覧を保持し、アップグレード時に license audit を再実行します。' },
      taibun: { statusTag: 'MIT', status: 'ローカル package metadata は MIT を示しています。', usage: '台湾語文を Tailo に変換し、字幕、分割確認、校正に使います。', governance: 'バージョンとライセンスを保持し、Tailo 結果は人手で修正可能にします。' },
      jieba: { statusTag: 'MIT', status: 'ローカル package metadata は MIT を示しています。', usage: '中国語分かち書きにより、原稿から語彙候補を抽出します。', governance: '分割結果は候補扱いとし、評価と問題報告で品質を確認します。' },
      fastapi: { statusTag: 'オープンソース依存', status: 'package metadata と公式 repository を基準にします。', usage: 'API、ジョブキュー、ファイル配布、ログイン、管理端点。', governance: 'デプロイ版を固定し、更新前にライセンスと安全性を確認します。' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: 'npm metadata では React、Ant Design、Vite は MIT、TypeScript は Apache-2.0。', usage: 'Web UI、フォーム、評価、タブ、統計、出典管理ページ。', governance: '依存バージョンを保持し、公開前に dependency notice を作成します。' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: '現在は /opt/homebrew/bin/ffmpeg 8.1 を使用。Homebrew formula は GPL-3.0-or-later。--enable-gpl、libx264、libx265 を含み、--enable-nonfree は見当たりません。', usage: 'サーバー側のみで音声結合、長さ取得、字幕付き波形 mp4 出力に使用。バイナリは前端に同梱しません。', governance: '短期はバージョン、パス、formula、ビルド引数、Legal リンクを記録。長期は LGPL-only build と libx264/libx265 回避を検討します。' },
      storage: { statusTag: '保存ツール', status: 'SQLite は public domain、PostgreSQL は PostgreSQL License。', usage: 'ジョブ、語彙、評価、統計、匿名ニックネーム、バックアップを書き込みます。', governance: '外部取り込み行には source、license、retrieved_at を保持します。' },
      seed: { statusTag: '自サイト整理', status: '手作業で整理した初期データ。', usage: '検索、テスト、分割、音声生成の初期語彙。', governance: '作成者、作成時刻、修正、評価履歴を保存します。' },
      userContribution: { statusTag: 'ユーザー投稿', status: 'サイト改善への利用を規約で明示する必要があります。', usage: '翻訳メモリ、語彙 DB、音声順位、品質評価を作ります。', governance: '匿名ニックネーム履歴、ログイン email 識別、ユーザー別評価変更を保存します。' },
      moe: { statusTag: '正式確認待ち', status: '公開検索とダウンロードは可能ですが、一括取り込み、商用利用、再配布条件は確認が必要です。', usage: '手作業の校正と検索参照のみ。SQLite へ自動一括取り込みしません。', governance: '取り込み前に条項、取得日、版、引用文、再配布可否を記録します。' },
      chhoeTaigi: { statusTag: 'データセット別確認', status: '子出典ごとにライセンスが異なる可能性があります。', usage: '手作業検索、訳語比較、候補語整理に使います。', governance: '利用許諾が明確な部分だけを取り込み、source_id を保持します。' },
      external: { statusTag: '既定では取り込み不可', status: '明確な再利用許諾がある場合のみ可能です。', usage: '人間が参照して自分の修正を書くことはできますが、直接クロールやコピーはしません。', governance: '新規出典は license、commercial_use、redistribution、attribution の審査を通します。' },
    },
    rowNames: {
      seed: { name: '内蔵シード語彙', note: '例：逐家好、歹勢、毋免客氣、食果子拜樹頭など。' },
      userContribution: { name: 'ユーザー検索、生成、評価、修正', note: 'サイト利用の中で自然に蓄積されます。' },
      moe: { name: '教育部 台湾台語常用詞辞典' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi 系コミュニティ資源' },
      external: { name: 'その他の公開辞典、論文、コーパス、ニュース内容', note: '自動データ源には含めません。' },
    },
    alertTitle: '公開運用前のデータ管理ルール',
    alertDescription: '外部資料を正式に取り込む前に、source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required、notes を記録します。再利用未確認の資料は手作業参照のみで、一括取り込み、ダウンロード提供、自サイト語彙への混入はしません。',
  },
  ko: {
    intro: '이 장부는 공개 운영 전 라이선스 거버넌스 기준에 따라 각 도구, 모델, 어휘 출처, 공개 데이터베이스의 출처, 라이선스 상태, 사이트 내 용도, 관리 조치를 기록합니다. “확인 대기” 자료는 수동 조회나 교정 참고용으로만 사용하며 일괄 가져오기, 재배포, 다운로드 가능한 데이터베이스로 제공하지 않습니다.',
    governanceTitle: '라이선스 상태 분류',
    governanceTags: [
      { color: 'success', label: '시스템 의존성 사용 가능' },
      { color: 'processing', label: '자체/사용자 기여' },
      { color: 'warning', label: '확인 후 가져오기' },
      { color: 'error', label: '가져오기 금지' },
    ],
    governanceItems: [
      { title: '시스템 의존성 사용 가능', description: '오픈소스 라이선스가 명확해 코드, 모델, 도구로 사용할 수 있으며 라이선스 문구와 출처 링크를 보관합니다.' },
      { title: '자체/사용자 기여', description: '사이트가 만들거나 사용자 피드백에서 온 자료입니다. 제출 자료가 번역과 음성 생성 개선에 쓰일 수 있음을 약관에 명시합니다.' },
      { title: '확인 후 가져오기', description: '수동 참고는 가능하지만 SQLite 입력, 공개 검색, 출력 파일에는 상업적 이용, 변경, 재배포, 표시 조건 확인이 필요합니다.' },
      { title: '가져오기 금지', description: '재사용 허가가 없거나 크롤링/상업 이용이 금지되거나 개인 열람만 허용된 자료는 데이터베이스에 넣지 않습니다.' },
    ],
    toolsTitle: '모델, 도구, 프레임워크',
    dictionariesTitle: '어휘 출처, 고정 표현, 공개 데이터베이스',
    columns: { source: '출처', status: '라이선스/상태', usage: '사이트 용도', governance: '관리 조치' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: '로컬 README, LICENSE, pyproject 모두 Apache-2.0 을 표시합니다.', usage: '대만어 원고와 참조 음성으로 wav 음성을 만들고 영상 파이프라인에 사용합니다.', governance: 'LICENSE 를 보관하고 AI 생성 표시를 하며 사칭, 사기, 오도 사용을 금지합니다.' },
      pytorch: { statusTag: 'BSD-style', status: '로컬 torch metadata 는 BSD-3-Clause 를 표시합니다.', usage: 'MPS/CPU 추론과 오디오 텐서 처리 기반입니다.', governance: '제3자 라이선스 목록을 보관하고 업그레이드 시 license audit 을 다시 실행합니다.' },
      taibun: { statusTag: 'MIT', status: '로컬 패키지 metadata 는 MIT 를 표시합니다.', usage: '대만어 문자를 Tailo 로 변환해 자막, 분단 검토, 교정에 사용합니다.', governance: '패키지 버전과 라이선스를 보관하고 Tailo 결과는 사람이 수정할 수 있게 합니다.' },
      jieba: { statusTag: 'MIT', status: '로컬 패키지 metadata 는 MIT 를 표시합니다.', usage: '중국어 분절로 원고에서 어휘 후보를 만듭니다.', governance: '분절 결과는 후보로만 보고 평가와 신고로 품질을 확인합니다.' },
      fastapi: { statusTag: '오픈소스 의존성', status: '패키지 metadata 와 공식 repository 를 기준으로 합니다.', usage: 'API, 작업 대기열, 파일 다운로드, 로그인, 관리자 엔드포인트.', governance: '배포 버전을 고정하고 업데이트 전 라이선스와 보안을 검토합니다.' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: 'npm metadata 기준 React, Ant Design, Vite 는 MIT, TypeScript 는 Apache-2.0 입니다.', usage: 'Web UI, 폼, 평점, 탭, 통계, 출처 관리 페이지.', governance: '프런트엔드 의존성 버전을 보관하고 공개 전 dependency notice 를 준비합니다.' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: '현재 /opt/homebrew/bin/ffmpeg 8.1 을 사용합니다. Homebrew formula 는 GPL-3.0-or-later 입니다. --enable-gpl, libx264, libx265 를 포함하고 --enable-nonfree 는 보이지 않습니다.', usage: '서버 측에서만 오디오 결합, 길이 확인, 자막 파형 mp4 렌더링에 사용합니다. 바이너리는 프런트엔드에 포함하지 않습니다.', governance: '단기적으로 버전, 경로, formula, 빌드 옵션, Legal 링크를 기록합니다. 장기적으로 LGPL-only build 와 libx264/libx265 회피를 검토합니다.' },
      storage: { statusTag: '저장 도구', status: 'SQLite 는 public domain, PostgreSQL 은 PostgreSQL License 입니다.', usage: '작업, 어휘, 평점, 통계, 익명 닉네임, 백업 내보내기를 저장합니다.', governance: '외부 가져오기 행에는 source, license, retrieved_at 필드를 보관합니다.' },
      seed: { statusTag: '자체 정리', status: '수동으로 정리한 초기 자료입니다.', usage: '검색, 테스트, 분절, 음성 생성의 초기 어휘입니다.', governance: '작성자, 생성 시각, 수정, 평가 이력을 보관합니다.' },
      userContribution: { statusTag: '사용자 기여', status: '사이트 데이터베이스 개선에 사용할 수 있음을 약관에 명시해야 합니다.', usage: '번역 메모리, 어휘 DB, 음성 버전 순위, 품질 점수를 만듭니다.', governance: '익명 닉네임 이력, 로그인 email 식별, 사용자별 평가 변경을 보관합니다.' },
      moe: { statusTag: '공식 확인 대기', status: '공개 조회와 다운로드는 가능하지만 일괄 가져오기, 상업 이용, 재배포 조건을 확인해야 합니다.', usage: '수동 교정과 조회 참고용이며 SQLite 에 자동 일괄 입력하지 않습니다.', governance: '가져오기 전 조건, 다운로드일, 버전, 인용문, 재배포 가능 여부를 기록합니다.' },
      chhoeTaigi: { statusTag: '데이터셋별 확인 필요', status: '하위 출처마다 라이선스가 다를 수 있습니다.', usage: '수동 조회, 번역 비교, 후보 표현 정리에 사용합니다.', governance: '사이트 용도에 대한 허가가 명확한 부분만 가져오고 source_id 를 보관합니다.' },
      external: { statusTag: '기본 가져오기 금지', status: '라이선스가 재사용을 명확히 허용할 때만 가능합니다.', usage: '사람이 읽고 직접 수정문을 작성할 수는 있지만, 시스템이 직접 크롤링하거나 복사하지 않습니다.', governance: '새 출처는 license, commercial_use, redistribution, attribution 심사를 통과해야 합니다.' },
    },
    rowNames: {
      seed: { name: '내장 시드 어휘', note: '예: 逐家好, 歹勢, 毋免客氣, 食果子拜樹頭 등.' },
      userContribution: { name: '사용자 검색, 생성, 평점, 수정', note: '사이트 사용 과정에서 자연스럽게 누적됩니다.' },
      moe: { name: '교육부 대만 타이기 상용어 사전' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi 계열 커뮤니티 자료' },
      external: { name: '기타 공개 사전, 논문, 말뭉치, 뉴스 콘텐츠', note: '자동 데이터 원천으로 설정하지 않습니다.' },
    },
    alertTitle: '공개 운영 전 데이터 거버넌스 규칙',
    alertDescription: '외부 자료를 정식으로 가져오기 전 모든 출처는 source_url, license_name, license_url, retrieved_at, version, commercial_use, redistribution, attribution_required, notes 를 가져야 합니다. 재사용이 확인되지 않은 자료는 수동 참고용만 가능하며 일괄 가져오기, 다운로드 제공, 자체 어휘와 혼합을 하지 않습니다.',
  },
  taigi: {
    intro: '這个台帳照公開營運以前的授權治理建議，記錄逐項工具、模型、辭源佮公開資料庫的來源、授權狀態、本站用途佮治理動作。「待確認」的資料干焦予人查詢、校稿參考，無直接大量匯入、閣散布，嘛無做做會下載的資料庫。',
    governanceTitle: '授權狀態分類',
    governanceTags: [
      { color: 'success', label: '會使納入系統依賴' },
      { color: 'processing', label: '本站家己/使用者貢獻' },
      { color: 'warning', label: '確認了後才匯入' },
      { color: 'error', label: '袂使匯入' },
    ],
    governanceItems: [
      { title: '會使納入系統依賴', description: '開源授權清楚，會使做程式、模型抑是工具使用；猶原愛保留授權文字佮來源連結。' },
      { title: '本站家己/使用者貢獻', description: '本站建立抑是使用者回饋產生，愛佇服務條款講明投稿資料會使予本站改善轉譯佮聲音生成。' },
      { title: '確認了後才匯入', description: '會使人工參考，毋過欲匯入 SQLite、開放查詢抑是輸出檔案前，愛確認商用、改作、閣散布佮署名條件。' },
      { title: '袂使匯入', description: '無可閣利用授權、禁止爬取、禁止商用抑是干焦予個人瀏覽的資料，袂放入本站資料庫。' },
    ],
    toolsTitle: '模型、工具佮框架',
    dictionariesTitle: '辭源、固定語句佮公開資料庫',
    columns: { source: '來源', status: '授權/狀態', usage: '本站用途', governance: '治理動作' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: '本機 README、LICENSE、pyproject 攏標 Apache-2.0。', usage: '照台語稿佮參考聲音產生 wav 聲音，予影片流程使用。', governance: '保留 LICENSE；公開頁標 AI 生成；禁止冒名、詐欺、誤導用途。' },
      pytorch: { statusTag: 'BSD-style', status: '本機 torch metadata 顯示 BSD-3-Clause。', usage: '提供 MPS/CPU 推論佮聲音張量處理基礎。', governance: '保留第三方授權清單；版本更新時閣做 license audit。' },
      taibun: { statusTag: 'MIT', status: '本機套件 metadata 顯示 MIT。', usage: '台語文字轉台羅拼音，予字幕、分段檢視佮校稿使用。', governance: '保留套件版本佮授權；台羅結果會使人工修正。' },
      jieba: { statusTag: 'MIT', status: '本機套件 metadata 顯示 MIT。', usage: '中文分詞，對稿件產生語詞資料庫候選詞。', governance: '分詞干焦做候選；愛配合人工評分佮回報減少錯詞入資料庫。' },
      fastapi: { statusTag: '開源依賴', status: '照套件 metadata 佮官方 repository 做準。', usage: 'API、工課佇列、檔案下載、登入佮管理端點。', governance: '部署版本固定；升級前檢查授權佮安全更新。' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: '本機 npm metadata：React、Ant Design、Vite 是 MIT；TypeScript 是 Apache-2.0。', usage: 'Web UI、表單、評分、分頁、統計佮來源授權頁。', governance: '保留前端依賴版本；公開部署前建立 dependency notice。' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: '目前用 /opt/homebrew/bin/ffmpeg 8.1；Homebrew formula 標 GPL-3.0-or-later。編譯參數有 --enable-gpl、libx264、libx265，無看著 --enable-nonfree。', usage: 'Server-side only：合併聲音、讀時長、用 libx264/aac 輸出字幕波形 mp4；目前無提供 FFmpeg binary 予人下載，嘛無包入前端。', governance: '短期保留版本、路徑、formula、編譯參數佮 Legal 連結。長期若欲降低散布義務，改建 LGPL-only FFmpeg，避免 libx264/libx265。' },
      storage: { statusTag: '資料儲存工具', status: 'SQLite public domain；PostgreSQL 用 PostgreSQL License。', usage: '保存 Jobs、語詞、評分、統計、匿名暱稱佮備份匯出。', governance: '資料庫內外部匯入資料愛保留 source、license、retrieved_at 欄位。' },
      seed: { statusTag: '本站整理', status: '人工整理的起始資料。', usage: '做查詢、測試、分詞佮聲音生成的初始詞庫。', governance: '逐筆保留建立者、建立時間、後續修正佮評分紀錄。' },
      userContribution: { statusTag: '使用者貢獻', status: '服務條款愛明示會使用來改善本站資料庫。', usage: '建立轉譯記憶、語詞資料庫、聲音版本排序佮品質評分。', governance: '匿名者保留匿名暱稱佮歷史；登入者保留 email 識別；允許改家己的評分。' },
      moe: { statusTag: '待正式確認', status: '會使公開查詢佮下載，毋過大量匯入、商用佮閣散布條件愛逐項確認。', usage: '目前干焦做人工校稿佮查詞參考，無自動大量匯入本站 SQLite。', governance: '正式匯入前記錄授權條款、下載日期、版本、引用文字佮敢會使閣散布。' },
      chhoeTaigi: { statusTag: '待資料集逐項確認', status: '無仝子資料來源可能有無仝授權。', usage: '做人工查詞、比較譯法佮候選語詞整理參考。', governance: '若欲匯入，干焦匯入授權明確閣允准本站用途的子集，並保留 source_id。' },
      external: { statusTag: '預設袂使匯入', status: '除非授權條款明確允准。', usage: '會使予人查閱了後寫家己的修正，毋直接爬取抑是複製入資料庫。', governance: '新增來源前愛通過授權欄位審核：license、commercial_use、redistribution、attribution。' },
    },
    rowNames: {
      seed: { name: '內建種子語詞', note: '逐家好、歹勢、毋免客氣、食果子拜樹頭等等。' },
      userContribution: { name: '使用者查詢、生成、評分佮修正', note: '本站使用過程自然累積。' },
      moe: { name: '教育部臺灣台語常用詞辭典' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi 類型社群資源' },
      external: { name: '其他公開辭典、論文、語料佮新聞內容', note: '無列入本站自動資料源。' },
    },
    alertTitle: '公開營運前的資料治理規則',
    alertDescription: '正式匯入外部資料前，逐筆來源攏愛有 source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required 佮 notes。未確認會使閣利用的資料干焦做人查詢參考，毋大量匯入、毋提供下載、毋混入本站家己的詞庫。',
  },
  tailo: {
    intro: 'Tsit ê tâi-tiùnn tsiàu kong-khui îng-ūn tsîng ê sû-khuân tī-lí kiàn-gī, kì-lio̍k muí tsi̍t hāng kang-kū, bôo-hîng, sû-guân kap kong-khui tsu-liāu-khòo ê guân-thâu, sû-khuân tsōng-thài, pún-tsām iōng-to͘ kap tī-lí tōng-tsok. “Tán khak-jīn” ê tsu-liāu kan-na tsò jîn-kang tshiau-tshuē kap kàu-kó tsham-khó, bô pi̍t-tshiùnn huī-ji̍p, tsài sàn-pòo, á-sī tsò hóo-táng-tsài ê tsu-liāu-khòo.',
    governanceTitle: 'Sû-khuân tsōng-thài hun-luī',
    governanceTags: [
      { color: 'success', label: 'Ē-tàng ji̍p hē-thóng i-lāi' },
      { color: 'processing', label: 'Pún-tsām ka-kī / iōng-chiá kòng-hiàn' },
      { color: 'warning', label: 'Khak-jīn liáu āu tsiah huī-ji̍p' },
      { color: 'error', label: 'Bē-sái huī-ji̍p' },
    ],
    governanceItems: [
      { title: 'Ē-tàng ji̍p hē-thóng i-lāi', description: 'Khai-guân sû-khuân tshing-tshó, ē-tàng tsò thîng-sik, bôo-hîng á-sī kang-kū; iáu tio̍h pó-liû sû-khuân bûn-jī kap guân-thâu liân-kiat.' },
      { title: 'Pún-tsām ka-kī / iōng-chiá kòng-hiàn', description: 'Pún-tsām kiàn-li̍p á-sī iōng-chiá huê-pòo sán-sing, tio̍h tī ho̍k-bū tiâu-khuán suat-bîng ē-tàng īng lâi kái-siān tsuán-i̍k kap siann-im sán-sing.' },
      { title: 'Khak-jīn liáu āu tsiah huī-ji̍p', description: 'Ē-tàng jîn-kang tsham-khó, m̄-koh beh huī-ji̍p SQLite, khai-hòng tshiau-tshuē á-sī tshut su-liāu tsîng, tio̍h khak-jīn siong-iōng, kái-tsok, tsài sàn-pòo kap siá-miâ tiâu-kiānn.' },
      { title: 'Bē-sái huī-ji̍p', description: 'Bô thang tsài lī-iōng ê sû-khuân, kìm tsuá-tshuē, kìm siong-iōng, á-sī kan-na hōo lâng ka-kī khuànn ê tsu-liāu, bē pàng ji̍p tsu-liāu-khòo.' },
    ],
    toolsTitle: 'Bôo-hîng, kang-kū kap framework',
    dictionariesTitle: 'Sû-guân, kòo-tīng gí-kù kap kong-khui tsu-liāu-khòo',
    columns: { source: 'Guân-thâu', status: 'Sû-khuân/tsōng-thài', usage: 'Pún-tsām iōng-to͘', governance: 'Tī-lí tōng-tsok' },
    rows: {
      voxcpm: { statusTag: 'Apache-2.0', status: 'Pún-ki README, LICENSE, pyproject lóng piau Apache-2.0.', usage: 'Tsiàu Tâi-gí khó kap tsham-khó siann sán-sing wav siann-im, hōo iánn-phìnn lâu-thîng sú-iōng.', governance: 'Pó-liû LICENSE; kong-khui ia̍h piau AI sán-sing; kìm mōo-miâ, tsà-khi, gōo-tōo iōng-to͘.' },
      pytorch: { statusTag: 'BSD-style', status: 'Pún-ki torch metadata hián-sī BSD-3-Clause.', usage: 'Thê-kiong MPS/CPU thu-lūn kap siann-im tiunn-liōng tshú-lí ki-tshóo.', governance: 'Pó-liû tē-sann-hong sû-khuân tshing-tuann; sing-kip pán-pún ê sî koh tsò license audit.' },
      taibun: { statusTag: 'MIT', status: 'Pún-ki thòo-kiānn metadata hián-sī MIT.', usage: 'Tâi-gí bûn-jī tsuán Tâi-lô phing-im, hōo jī-bō, hun-tuānn kiam-sī kap kàu-kó.', governance: 'Pó-liû thòo-kiānn pán-pún kap sû-khuân; Tâi-lô kiat-kó ē-tàng jîn-kang siu-tsìng.' },
      jieba: { statusTag: 'MIT', status: 'Pún-ki thòo-kiānn metadata hián-sī MIT.', usage: 'Tiong-bûn hun-sû, tuì khó sán-sing gí-sû tsu-liāu-khòo hāu-suán-sû.', governance: 'Hun-sû kan-na tsò hāu-suán; tio̍h phòo-ha̍p phîng-hun kap huê-pòo kám-tsió tshò-gí ji̍p khòo.' },
      fastapi: { statusTag: 'Khai-guân i-lāi', status: 'Tsiàu thòo-kiānn metadata kap kuann-hong repository tsò tsún.', usage: 'API, kang-khò pāi-tuī, tóng-àn tāng-tsài, teng-ji̍p kap kuán-lí endpoint.', governance: 'Pòo-sú pán-pún kòo-tīng; sing-kip tsîng kiám-tsha sû-khuân kap an-tsuân king-sin.' },
      frontend: { statusTag: 'MIT / Apache-2.0', status: 'Pún-ki npm metadata: React, Ant Design, Vite sī MIT; TypeScript sī Apache-2.0.', usage: 'Web UI, pió-tuann, phîng-hun, hun-ia̍h, thong-kè kap guân-thâu sû-khuân ia̍h.', governance: 'Pó-liû tsîng-tuann i-lāi pán-pún; kong-khui pòo-sú tsîng kiàn-li̍p dependency notice.' },
      ffmpeg: { statusTag: 'GPL-3.0-or-later build', status: 'Taⁿ pòo-sú īng /opt/homebrew/bin/ffmpeg 8.1; Homebrew formula piau GPL-3.0-or-later. Pian-i̍k tsham-sòo ū --enable-gpl, libx264, libx265, bô khuànn tio̍h --enable-nonfree.', usage: 'Server-side only: ha̍p-pìng siann-im, tha̍k sî-tn̂g, īng libx264/aac tshut jī-bō waveform mp4; taⁿ bô hōo lâng tāng-tsài FFmpeg binary, mā bô pau ji̍p frontend.', governance: 'Té-kî pó-liû pán-pún, lōo-kìng, formula, pian-i̍k tsham-sòo kap Legal liân-kiat. Tn̂g-kî nā beh kám-tī sàn-pòo gī-bū, kái kiàn LGPL-only FFmpeg, pī-bián libx264/libx265.' },
      storage: { statusTag: 'Tsu-liāu póo-tsûn kang-kū', status: 'SQLite public domain; PostgreSQL īng PostgreSQL License.', usage: 'Póo-tsûn Jobs, gí-sû, phîng-hun, thong-kè, bû-miâ phiau-hō kap pī-hūn huī-tshut.', governance: 'Tsu-liāu-khòo lāi guā-pōo huī-ji̍p tsu-liāu tio̍h pó-liû source, license, retrieved_at欄位。' },
      seed: { statusTag: 'Pún-tsām tsíng-lí', status: 'Jîn-kang tsíng-lí ê khí-thâu tsu-liāu.', usage: 'Tsò tshiau-tshuē, tshik-giām, hun-sû kap siann-im sán-sing ê khí-thâu sû-khòo.', governance: 'Muí pit pó-liû kiàn-li̍p-chiá, kiàn-li̍p sî-kan, āu-lâi siu-tsìng kap phîng-hun kì-lio̍k.' },
      userContribution: { statusTag: 'Iōng-chiá kòng-hiàn', status: 'Ho̍k-bū tiâu-khuán tio̍h bîng-sī ē-tàng īng lâi kái-siān pún-tsām tsu-liāu-khòo.', usage: 'Kiàn-li̍p tsuán-i̍k kì-ik, gí-sû tsu-liāu-khòo, siann-im pán-pún pái-sū kap phín-tsit phîng-hun.', governance: 'Bû-miâ-chiá pó-liû bû-miâ phiau-hō kap le̍k-sú; teng-ji̍p-chiá pó-liû email sik-pia̍t; ín-tsún kái ka-kī ê phîng-hun.' },
      moe: { statusTag: 'Tán tsìng-sik khak-jīn', status: 'Ē-tàng kong-khui tshiau-tshuē kap tāng-tsài, m̄-koh tuā-liōng huī-ji̍p, siong-iōng kap tsài sàn-pòo tiâu-kiānn tio̍h tsi̍t-hāng tsi̍t-hāng khak-jīn.', usage: 'Taⁿ kan-na tsò jîn-kang kàu-kó kap tshiau-sû tsham-khó, bô tsū-tōng tuā-liōng huī-ji̍p pún-tsām SQLite.', governance: 'Tsìng-sik huī-ji̍p tsîng kì-lio̍k sû-khuân tiâu-khuán, tāng-tsài ji̍t-kî, pán-pún, ín-iōng bûn-jī kap kám ē-tàng tsài sàn-pòo.' },
      chhoeTaigi: { statusTag: 'Tán muí tsu-liāu-chi̍p khak-jīn', status: 'Bô kâng ê kiáⁿ-tsu-liāu guân-thâu khó-lîng ū bô kâng sû-khuân.', usage: 'Tsò jîn-kang tshiau-sû, pí-kàu i̍k-huat kap hāu-suán gí-sû tsíng-lí tsham-khó.', governance: 'Nā beh huī-ji̍p, kan-na huī-ji̍p sû-khuân tshing-tshó koh ín-tsún pún-tsām iōng-to͘ ê tsí-chi̍p, koh pó-liû source_id.' },
      external: { statusTag: 'Ī-siat bē-sái huī-ji̍p', status: 'Tû-hui sû-khuân tiâu-khuán bîng-khak ín-tsún.', usage: 'Ē-tàng hōo lâng tshiau-tha̍k liáu-āu siá ka-kī ê siu-tsìng, m̄-koh bô ti̍t-tsiap tsuá-tshuē á-sī khóo-pih ji̍p tsu-liāu-khòo.', governance: 'Sin guân-thâu tsîng tio̍h thong-kuè license, commercial_use, redistribution, attribution ê sim-ha̍t.' },
    },
    rowNames: {
      seed: { name: 'Lāi-kiàn tsíng-tsí gí-sû', note: 'Tio̍k-ke-hó, pháinn-sè, m̄-bián kheh-khì, tsia̍h kué-tsí pài tshiū-thâu téng-téng.' },
      userContribution: { name: 'Iōng-chiá tshiau-tshuē, sán-sing, phîng-hun kap siu-tsìng', note: 'Pún-tsām sú-iōng ê kòe-thîng tsū-jiân luí-tsik.' },
      moe: { name: 'Kàu-io̍k-pōo Tâi-uân Tâi-gí siông-iōng sû sû-tián' },
      chhoeTaigi: { name: 'ChhoeTaigi / iTaigi huāng ê siā-kûn tsu-guân' },
      external: { name: 'Kî-tha kong-khui sû-tián, lūn-bûn, gí-liāu kap sin-bûn luē-iông', note: 'Bô lia̍t ji̍p pún-tsām tsū-tōng tsu-liāu guân-thâu.' },
    },
    alertTitle: 'Kong-khui îng-ūn tsîng ê tsu-liāu tī-lí kui-tsik',
    alertDescription: 'Tsìng-sik huī-ji̍p guā-pōo tsu-liāu tsîng, muí pit guân-thâu lóng tio̍h ū source_url, license_name, license_url, retrieved_at, version, commercial_use, redistribution, attribution_required kap notes. Bē khak-jīn ē-tàng tsài lī-iōng ê tsu-liāu kan-na hōo lâng tshiau-tshuē tsham-khó, bô tuā-liōng huī-ji̍p, bô thê-kiong tāng-tsài, bô tsham ji̍p pún-tsām ka-kī ê sû-khòo.',
  },
};

function SourceGovernanceCard({ title, copy }: { title: string; copy: SourceCopy }) {
  const renderRows = (section: 'tools' | 'dictionaries') => (
    <div className="source-table">
      <div className="source-row source-row-head">
        <Text strong>{copy.columns.source}</Text>
        <Text strong>{copy.columns.status}</Text>
        <Text strong>{copy.columns.usage}</Text>
        <Text strong>{copy.columns.governance}</Text>
      </div>
      {SOURCE_ROW_CONFIG.filter((row) => row.section === section).map((row) => {
        const rowCopy = copy.rows[row.key];
        const rowName = copy.rowNames?.[row.key];
        return (
          <div className="source-row" key={row.key}>
            <div>
              <Text strong>{rowName?.name ?? row.name}</Text>
              {(rowName?.note ?? row.note) && <Text type="secondary">{rowName?.note ?? row.note}</Text>}
              {row.links?.map((link) => (
                <Typography.Link href={link.href} target="_blank" key={link.href}>
                  {link.label}
                </Typography.Link>
              ))}
            </div>
            <div>
              <Tag color={row.color}>{rowCopy.statusTag}</Tag>
              <Text type="secondary">{rowCopy.status}</Text>
            </div>
            <Text type="secondary">{rowCopy.usage}</Text>
            <Text type="secondary">{rowCopy.governance}</Text>
          </div>
        );
      })}
    </div>
  );

  return (
    <Card className="sources-card">
      <div className="card-title">
        <Title level={3} style={{ margin: 0 }}>{title}</Title>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Paragraph type="secondary">{copy.intro}</Paragraph>
        <div className="source-section">
          <Flex align="center" justify="space-between" gap={12} wrap>
            <Title level={4}>{copy.governanceTitle}</Title>
            <Space wrap>
              {copy.governanceTags.map((tag) => (
                <Tag color={tag.color} key={`${tag.color}-${tag.label}`}>{tag.label}</Tag>
              ))}
            </Space>
          </Flex>
          <div className="governance-grid">
            {copy.governanceItems.map((item) => (
              <div key={item.title}>
                <Text strong>{item.title}</Text>
                <Text type="secondary">{item.description}</Text>
              </div>
            ))}
          </div>
        </div>

        <div className="source-section">
          <Title level={4}>{copy.toolsTitle}</Title>
          {renderRows('tools')}
        </div>

        <div className="source-section">
          <Title level={4}>{copy.dictionariesTitle}</Title>
          {renderRows('dictionaries')}
        </div>

        <Alert
          type="warning"
          showIcon
          message={copy.alertTitle}
          description={copy.alertDescription}
        />
      </Space>
    </Card>
  );
}

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
  static_media?: Record<string, string>;
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
  regenerated_at?: number;
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
  llm_random_sentence_enabled?: boolean;
  pipeline: string[];
}

interface AdminSettings {
  default_reference_voice_mode: 'default' | 'random';
  public_rate_limit_seconds: number;
  api_access_token: string;
  postgres_dsn: string;
  postgres_schema: string;
  llm_api_base_url: string;
  llm_api_key: string;
  llm_model: string;
  object_storage_bucket: string;
  object_storage_prefix: string;
  object_storage_endpoint_url: string;
  object_storage_region: string;
  object_storage_profile: string;
  object_storage_public_url: string;
}

interface RandomSentenceResponse {
  title: string;
  chinese_text: string;
  source: 'llm' | 'fallback';
  model?: string;
}

interface PostgresExportResult {
  exported: boolean;
  schema_name: string;
  kv_rows: number;
  job_rows: number;
  exported_at: number;
}

interface StaticSyncResult {
  synced: boolean;
  bucket: string;
  prefix: string;
  destination: string;
  file_count: number;
  byte_count: number;
  synced_at: number;
  public_url?: string;
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
  status?: string;
  request_count?: number;
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
  static_media?: {
    audio?: string;
    video?: string;
    assets?: Record<string, { audio?: string; video?: string }>;
  };
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
  lexicon_quality?: {
    word_entries_total: number;
    word_entries_rated: number;
    word_entries_unrated: number;
    word_assets_total: number;
    word_assets_rated: number;
    word_assets_unrated: number;
    word_problem_count: number;
    word_problem_rate: number;
    word_regeneration_requests: number;
    word_regeneration_complete: number;
    word_regeneration_queued: number;
    word_regeneration_running: number;
    word_regeneration_failed: number;
    word_translation_requests: number;
    source_export_requests?: number;
    source_export_requesters?: number;
    word_queries_total: number;
    word_assets_with_audio: number;
    word_assets_with_video: number;
  };
  actions?: Record<string, number>;
  source_exports?: {
    total_requests: number;
    requester_count: number;
    latest_requested_at?: number;
  };
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

async function loadStaticSnapshot<T>(path: string) {
  const res = await axios.get<T>(`${STATIC_DATA_BASE}/${path.replace(/^\//, '')}`, { timeout: 10000 });
  return res.data;
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
  const wordQueryRef = useRef('');
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(initialUiLanguage);
  const [activeTab, setActiveTab] = useState(initialPageTab);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentJobId, setSegmentJobId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, SegmentReviewPayload>>({});
  const [regeneratingSegments, setRegeneratingSegments] = useState<Record<number, boolean>>({});
  const [jobError, setJobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSentence, setGeneratingSentence] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingReviewed, setRegeneratingReviewed] = useState(false);
  const [exportingPostgres, setExportingPostgres] = useState(false);
  const [postgresExportResult, setPostgresExportResult] = useState<PostgresExportResult | null>(null);
  const [syncingStatic, setSyncingStatic] = useState(false);
  const [staticSyncResult, setStaticSyncResult] = useState<StaticSyncResult | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [requestingSourceExport, setRequestingSourceExport] = useState(false);
  const [sourceRequestWord, setSourceRequestWord] = useState('');
  const [sourceRequestNote, setSourceRequestNote] = useState('');
  const [readOnlyMode, setReadOnlyMode] = useState(false);
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
  const jobMediaSrc = (job: Job, kind: 'audio' | 'video' | 'zip' | 'taigi' | 'tailo' | 'segments') => (
    job.static_media?.[kind] || `/jobs/${job.id}/download/${kind}`
  );
  const wordAssetMediaSrc = (word: WordEntry, asset: WordAsset, kind: 'audio' | 'video') => (
    word.static_media?.assets?.[asset.id]?.[kind]
    || (asset.id === 'legacy' ? word.static_media?.[kind] : undefined)
    || `/words/${word.id}/assets/${asset.id}/download/${kind}`
  );
  const versionedUrl = (url: string, version?: number) => (
    version ? `${url}${url.includes('?') ? '&' : '?'}v=${Math.floor(version)}` : url
  );
  const segmentAudioSrc = (job: Job, segment: Segment | number) => {
    const segmentIndex = typeof segment === 'number' ? segment : segment.index;
    const version = typeof segment === 'number' ? undefined : segment.regenerated_at;
    const url = job.static_media?.segments
      ? `${STATIC_DATA_BASE}/media/jobs/${job.id}/segments/seg_${String(segmentIndex).padStart(2, '0')}.wav`
      : `/jobs/${job.id}/segments/${segmentIndex}/audio`;
    return versionedUrl(url, version);
  };

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
      setReadOnlyMode(false);
      setJobs(nextJobs);
      setSelectedJobId((current) => {
        if (nextJobs.length === 0) return null;
        if (current && nextJobs.some((job) => job.id === current)) return current;
        return nextJobs[0].id;
      });
    } catch (error) {
      const snapshot = await loadStaticSnapshot<{ jobs: Job[] }>('jobs/index.json');
      const nextJobs = snapshot.jobs ?? [];
      setReadOnlyMode(true);
      setJobs(nextJobs);
      setSelectedJobId((current) => {
        if (nextJobs.length === 0) return null;
        if (current && nextJobs.some((job) => job.id === current)) return current;
        return nextJobs[0].id;
      });
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadQueueStatus = async () => {
    const res = await axios.get<QueueStatus>('/api/status');
    setQueueStatus(res.data);
  };

  const setLexiconQuery = (value: string) => {
    wordQueryRef.current = value;
    setWordQuery(value);
  };

  const loadWords = async (query = wordQueryRef.current) => {
    wordQueryRef.current = query;
    try {
      const res = await axios.get<{ words: WordEntry[]; total: number }>('/words', { params: { q: query, limit: 30 } });
      setReadOnlyMode(false);
      setWords(res.data.words);
    } catch {
      const snapshot = await loadStaticSnapshot<{ words: WordEntry[]; total: number }>('lexicon/index.json');
      const cleaned = query.trim().toLowerCase();
      const filtered = cleaned
        ? (snapshot.words ?? []).filter((item) => (
          item.source.toLowerCase().includes(cleaned)
          || item.taigi.toLowerCase().includes(cleaned)
          || item.tailo.toLowerCase().includes(cleaned)
          || (item.category ?? '').toLowerCase().includes(cleaned)
          || (item.note ?? '').toLowerCase().includes(cleaned)
        ))
        : (snapshot.words ?? []);
      setReadOnlyMode(true);
      setWords(filtered.slice(0, 30));
    }
  };

  const loadStats = async () => {
    try {
      const res = await axios.get<StatsSummary>('/stats');
      setReadOnlyMode(false);
      setStats(res.data);
    } catch {
      const snapshot = await loadStaticSnapshot<StatsSummary>('stats.json');
      setReadOnlyMode(true);
      setStats(snapshot);
    }
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
    setLexiconQuery('');
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

  const syncStaticStorage = async () => {
    setSyncingStatic(true);
    setStaticSyncResult(null);
    try {
      const res = await axios.post<StaticSyncResult>('/admin/static/sync', {}, { timeout: 600000 });
      setStaticSyncResult(res.data);
      message.success('已同步公開靜態資料到 object storage');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法同步靜態資料');
    } finally {
      setSyncingStatic(false);
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

  const generateRandomSentence = async () => {
    setGeneratingSentence(true);
    try {
      const currentText = form.getFieldValue('chinese_text') || '';
      const res = await axios.post<RandomSentenceResponse>('/llm/random-sentence', {
        topic: currentText.trim().length > 0 && currentText !== defaultChineseText ? currentText : '',
        style: 'daily',
        length: 'short',
      }, { timeout: 35000 });
      form.setFieldsValue({
        title: res.data.title,
        chinese_text: res.data.chinese_text,
        taigi_override: '',
      });
      await loadStats().catch(() => undefined);
      message.success(res.data.source === 'llm' ? '已用 LLM 產生隨機句子' : '已用內建句庫產生隨機句子');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法產生隨機句子');
    } finally {
      setGeneratingSentence(false);
    }
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

  const segmentFeedbackBody = (draft: SegmentReviewPayload) => ({
    ...draft,
    corrections: draft.corrections.filter((correction) => (
      correction.source_phrase.trim()
      || correction.taigi_correction.trim()
      || correction.tailo_correction.trim()
      || correction.note.trim()
    )),
  });

  const regenerateSegment = async (segment: Segment) => {
    const draft = feedbackDrafts[segment.index];
    if (!selectedJob || !draft) {
      message.warning('分段資料尚未載入完成');
      return;
    }
    setRegeneratingSegments((current) => ({ ...current, [segment.index]: true }));
    setJobError(null);
    const messageKey = `regenerate-segment-${selectedJob.id}-${segment.index}`;
    message.loading({
      key: messageKey,
      content: `Segment ${segment.index} 正在重新產生語音，完成後會重建完整語音與影片`,
      duration: 0,
    });
    try {
      const res = await axios.post<{ regenerated: boolean; job: Job; segment: Segment }>(
        `/jobs/${selectedJob.id}/segments/${segment.index}/regenerate`,
        segmentFeedbackBody(draft),
        { timeout: 600000 },
      );
      setJobs((current) => current.map((job) => (job.id === res.data.job.id ? { ...job, ...res.data.job } : job)));
      await loadSegments(selectedJob.id);
      await loadJobs().catch(() => undefined);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success({
        key: messageKey,
        content: `Segment ${segment.index} 已重新產生語音，完整語音與影片已更新`,
      });
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '重新產生分段失敗。'
        : detail || '重新產生分段失敗。';
      setJobError(String(reason));
      message.error({ key: messageKey, content: String(reason) });
    } finally {
      setRegeneratingSegments((current) => ({ ...current, [segment.index]: false }));
    }
  };

  const regenerateReviewedSegments = async () => {
    if (!selectedJob) return;
    setRegeneratingReviewed(true);
    setJobError(null);
    const messageKey = `regenerate-reviewed-${selectedJob.id}`;
    message.loading({
      key: messageKey,
      content: '正在重新產生所有已儲存回饋的分段，完成後會重建完整語音與影片',
      duration: 0,
    });
    try {
      const res = await axios.post<{ regenerated: boolean; segment_count: number; job: Job }>(
        `/jobs/${selectedJob.id}/segments/regenerate-reviewed`,
        {},
        { timeout: 1200000 },
      );
      setJobs((current) => current.map((job) => (job.id === res.data.job.id ? { ...job, ...res.data.job } : job)));
      await loadSegments(selectedJob.id);
      await loadJobs().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success({
        key: messageKey,
        content: `已重新產生 ${res.data.segment_count} 個有回饋的分段，並重建完整語音與影片`,
      });
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '重新產生已回饋分段失敗。'
        : detail || '重新產生已回饋分段失敗。';
      setJobError(String(reason));
      message.error({ key: messageKey, content: String(reason) });
    } finally {
      setRegeneratingReviewed(false);
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

  const requestMissingWord = async () => {
    const query = wordQueryRef.current.trim();
    if (!query) {
      message.warning('請先輸入想新增的詞語');
      return;
    }
    try {
      await axios.post('/words/requests', { source: query, note: '查詢無符合結果，使用者申請新增詞料。' });
      await loadWords(query);
      await loadStats().catch(() => undefined);
      message.success('已送出新增詞料申請');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法送出新增詞料申請');
    }
  };

  const requestSourceExport = async () => {
    if (!auth?.email) {
      message.warning('這項申請需要先用 email 登入');
      return;
    }
    setRequestingSourceExport(true);
    try {
      const res = await axios.post('/sources/export-requests', {
        languages: UI_LANGUAGES.map((item) => item.value),
        format: 'json',
        note: '使用者在 Sources 頁面申請匯出網站多語系資料。',
      });
      await loadStats().catch(() => undefined);
      message.success(`已記錄匯出申請。你已申請 ${res.data.requester_count} 次。`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法送出匯出申請');
    } finally {
      setRequestingSourceExport(false);
    }
  };

  const requestSourceWord = async () => {
    const source = sourceRequestWord.trim();
    if (!source) {
      message.warning('請先輸入想增加的詞條');
      return;
    }
    if (!auth?.email) {
      message.warning('這項申請需要先用 email 登入');
      return;
    }
    try {
      const res = await axios.post('/words/requests', {
        source,
        note: sourceRequestNote.trim() || '使用者在 Sources 頁面申請增加多語系資料詞條。',
      });
      const wordId = res.data.word?.id;
      if (wordId) {
        await axios.post(`/words/${wordId}/translations`, {
          languages: UI_LANGUAGES.map((item) => item.value),
          overwrite: false,
        });
      }
      setSourceRequestWord('');
      setSourceRequestNote('');
      await loadWords();
      await loadStats().catch(() => undefined);
      message.success('已送出詞條與多語系語料申請');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法送出詞條申請');
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
                {readOnlyMode && (
                  <Alert
                    type="warning"
                    showIcon
                    message="目前使用靜態唯讀資料"
                    description="後端 API 暫時無法連線時，頁面會改讀已匯出的 S3/R2 相容靜態 snapshot；已完成內容仍可瀏覽與播放，但建立工作、登入、評分與申請功能需要後端恢復。"
                  />
                )}
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
                      <Button type="primary" loading={generatingSentence} onClick={generateRandomSentence}>
                        LLM 亂數生成句子
                      </Button>
                      {!apiInfo?.llm_random_sentence_enabled && (
                        <Text type="secondary">未設定 LLM 時會使用內建句庫。</Text>
                      )}
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
                              src={jobMediaSrc(selectedJob, 'audio')}
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
                                src={jobMediaSrc(selectedJob, 'video')}
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
                            <Button type="primary" icon={<DownloadOutlined />} href={jobMediaSrc(selectedJob, 'zip')}>
                              全部下載
                            </Button>
                            <Button icon={<AudioOutlined />} href={jobMediaSrc(selectedJob, 'audio')}>音訊</Button>
                            {selectedJob.video_path && (
                              <Button icon={<VideoCameraOutlined />} href={jobMediaSrc(selectedJob, 'video')}>影片</Button>
                            )}
                            <Button href={jobMediaSrc(selectedJob, 'taigi')}>台語稿</Button>
                            <Button href={jobMediaSrc(selectedJob, 'tailo')}>台羅</Button>
                            <Button href={jobMediaSrc(selectedJob, 'segments')}>分段 JSON</Button>
                            <Button onClick={regenerateReviewedSegments} loading={regeneratingReviewed}>
                              重生已回饋段落
                            </Button>
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
                                      <Button href={segmentAudioSrc(selectedJob, segment)} icon={<DownloadOutlined />}>
                                        WAV
                                      </Button>
                                    </Flex>
                                    <audio
                                      controls
                                      preload="none"
                                      style={{ width: '100%', marginTop: 10 }}
                                      src={segmentAudioSrc(selectedJob, segment)}
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
                                          <Button
                                            icon={<AudioOutlined />}
                                            loading={!!regeneratingSegments[segment.index]}
                                            onClick={() => regenerateSegment(segment)}
                                          >
                                            重新產生這段語音
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
                              key: 'llm',
                              label: 'LLM 亂數句子生成',
                              children: (
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                  <Paragraph type="secondary" style={{ margin: 0 }}>
                                    使用 OpenAI-compatible Chat Completions API。API key 只存在後端設定，不會暴露給前端；未設定時會自動使用內建句庫。
                                  </Paragraph>
                                  <Form.Item label="LLM API base URL" name="llm_api_base_url">
                                    <Input placeholder="https://api.openai.com/v1" />
                                  </Form.Item>
                                  <Form.Item label="LLM model" name="llm_model">
                                    <Input placeholder="例如：gpt-4o-mini，或你的 OpenAI-compatible model id" />
                                  </Form.Item>
                                  <Form.Item label="LLM API key" name="llm_api_key">
                                    <Input.Password placeholder="sk-..." />
                                  </Form.Item>
                                </Space>
                              ),
                            },
                          ]}
                        />
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
                        <Collapse
                          ghost
                          className="advanced-settings"
                          items={[
                            {
                              key: 'static-storage',
                              label: 'S3/R2 靜態資料同步',
                              children: (
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                  <Paragraph type="secondary" style={{ margin: 0 }}>
                                    前端和公開 snapshot 會先輸出到本機 static-data，再用 AWS CLI 同步到 S3/R2/GCS 相容 bucket。
                                    Access key 建議放在伺服器環境變數或 AWS profile，不要填在網頁設定內。
                                  </Paragraph>
                                  <Form.Item label="Bucket" name="object_storage_bucket">
                                    <Input placeholder="例如：taigi-public-static" />
                                  </Form.Item>
                                  <Form.Item label="Prefix" name="object_storage_prefix">
                                    <Input placeholder="例如：public 或 taigi-public" />
                                  </Form.Item>
                                  <Form.Item label="Endpoint URL（R2/MinIO 才需要）" name="object_storage_endpoint_url">
                                    <Input placeholder="https://<accountid>.r2.cloudflarestorage.com" />
                                  </Form.Item>
                                  <Form.Item label="Region" name="object_storage_region">
                                    <Input placeholder="auto、ap-northeast-1 等" />
                                  </Form.Item>
                                  <Form.Item label="AWS profile" name="object_storage_profile">
                                    <Input placeholder="留空使用環境變數或 default profile" />
                                  </Form.Item>
                                  <Form.Item label="Public CDN URL" name="object_storage_public_url">
                                    <Input placeholder="https://static.taigi.yihua.app" />
                                  </Form.Item>
                                  <Flex gap={10} wrap>
                                    <Button onClick={syncStaticStorage} loading={syncingStatic}>
                                      同步 static-data 到 S3/R2
                                    </Button>
                                  </Flex>
                                  {staticSyncResult && (
                                    <Alert
                                      type="success"
                                      showIcon
                                      message="已完成靜態資料同步"
                                      description={`${staticSyncResult.destination}：${staticSyncResult.file_count} 個檔案，${(staticSyncResult.byte_count / 1024 / 1024).toFixed(2)} MB。`}
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
                      <Title level={4}>{t('lexiconQualityTitle')}</Title>
                      <div className="stats-grid">
                        <div><Text type="secondary">詞條已評分</Text><strong>{stats.lexicon_quality?.word_entries_rated ?? 0}</strong></div>
                        <div><Text type="secondary">詞條未評分</Text><strong>{stats.lexicon_quality?.word_entries_unrated ?? 0}</strong></div>
                        <div><Text type="secondary">語音影片已評分</Text><strong>{stats.lexicon_quality?.word_assets_rated ?? 0}</strong></div>
                        <div><Text type="secondary">語音影片未評分</Text><strong>{stats.lexicon_quality?.word_assets_unrated ?? 0}</strong></div>
                        <div><Text type="secondary">問題詞料</Text><strong>{stats.lexicon_quality?.word_problem_count ?? 0}</strong></div>
                        <div><Text type="secondary">重新生成申請</Text><strong>{stats.lexicon_quality?.word_regeneration_requests ?? 0}</strong></div>
                        <div><Text type="secondary">多語系申請</Text><strong>{stats.lexicon_quality?.word_translation_requests ?? 0}</strong></div>
                        <div><Text type="secondary">資料匯出申請</Text><strong>{stats.lexicon_quality?.source_export_requests ?? 0}</strong></div>
                        <div><Text type="secondary">匯出申請人</Text><strong>{stats.lexicon_quality?.source_export_requesters ?? 0}</strong></div>
                        <div><Text type="secondary">語詞查詢</Text><strong>{stats.lexicon_quality?.word_queries_total ?? 0}</strong></div>
                      </div>
                      <div className="stats-grid compact-stats-grid">
                        <div><Text type="secondary">重新生成完成</Text><strong>{stats.lexicon_quality?.word_regeneration_complete ?? 0}</strong></div>
                        <div><Text type="secondary">重新生成排隊</Text><strong>{stats.lexicon_quality?.word_regeneration_queued ?? 0}</strong></div>
                        <div><Text type="secondary">重新生成執行中</Text><strong>{stats.lexicon_quality?.word_regeneration_running ?? 0}</strong></div>
                        <div><Text type="secondary">重新生成失敗</Text><strong>{stats.lexicon_quality?.word_regeneration_failed ?? 0}</strong></div>
                      </div>
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

                <SourceGovernanceCard title={t('sourcesTitle')} copy={SOURCE_COPY[uiLanguage]} />

                <Card className="sources-card">
                  <Flex align="start" justify="space-between" gap={12} wrap className="card-title">
                    <div>
                      <Title level={3} style={{ margin: 0 }}>多語系資料申請</Title>
                      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        多語系資料匯出與新增詞條申請會記錄 email、申請時間與累計次數，用來判斷是否有人持續訂閱與追蹤資料需求。
                      </Paragraph>
                    </div>
                    <Space wrap>
                      <Tag color="blue">匯出申請 {stats?.source_exports?.total_requests ?? 0}</Tag>
                      <Tag color="processing">申請人 {stats?.source_exports?.requester_count ?? 0}</Tag>
                    </Space>
                  </Flex>
                  {!auth?.email ? (
                    <Alert
                      type="info"
                      showIcon
                      message="請先用 email 登入"
                      description="只有 email 登入使用者可以申請匯出多語系資料，或申請增加多語系資料詞條。匿名使用者仍可查詢、播放與評分。"
                    />
                  ) : (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <div className="source-section">
                        <Flex align="center" justify="space-between" gap={12} wrap>
                          <div>
                            <Text strong>申請匯出網站多語系資料</Text>
                            <br />
                            <Text type="secondary">
                              目前會先留下申請紀錄，包含 {auth.email}、語言範圍、格式與申請時間；資料檔案正式開放時可依紀錄通知。
                            </Text>
                          </div>
                          <Button type="primary" loading={requestingSourceExport} onClick={requestSourceExport}>
                            申請匯出 JSON
                          </Button>
                        </Flex>
                      </div>

                      <div className="source-section">
                        <Text strong>申請增加多語系資料詞條</Text>
                        <Paragraph type="secondary">
                          送出後會建立詞條申請，並同時排入繁中、簡中、英文、日文、韓文、台語與台羅語料需求。
                        </Paragraph>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <Input
                            value={sourceRequestWord}
                            onChange={(event) => setSourceRequestWord(event.target.value)}
                            placeholder="想增加的中文詞條，例如：珍珠奶茶"
                          />
                          <TextArea
                            value={sourceRequestNote}
                            onChange={(event) => setSourceRequestNote(event.target.value)}
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            placeholder="補充說明，例如：希望補台語講法、台羅和例句。"
                          />
                          <Flex justify="flex-end">
                            <Button onClick={requestSourceWord}>送出詞條申請</Button>
                          </Flex>
                        </Space>
                      </div>
                    </Space>
                  )}
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
                    onChange={(event) => setLexiconQuery(event.target.value)}
                    onSearch={(value) => loadWords(value)}
                    style={{ marginBottom: 12 }}
                  />
                  {words.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message={t('lexiconEmpty')}
                      description={wordQuery.trim() ? (
                        <Flex align="center" justify="space-between" gap={12} wrap>
                          <Text>{t('requestNewWordHint')}</Text>
                          <Button type="primary" onClick={requestMissingWord}>
                            {t('requestNewWord')}：{wordQuery.trim()}
                          </Button>
                        </Flex>
                      ) : undefined}
                    />
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
                              {word.status === 'requested' && <Tag color="warning">新增申請</Tag>}
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
                              {!!word.request_count && (
                                <>
                                  <br />
                                  <Text type="secondary">新增申請 {word.request_count} 次</Text>
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
                                        src={wordAssetMediaSrc(word, asset, 'audio')}
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
                                        src={wordAssetMediaSrc(word, asset, 'video')}
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
