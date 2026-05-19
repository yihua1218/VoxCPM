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
  FileSearchOutlined,
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
const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
const STATIC_DATA_BASE = ((import.meta.env.VITE_STATIC_DATA_BASE_URL as string | undefined) || '/static-data/public').replace(/\/$/, '');
const PREFER_STATIC_DATA = ((import.meta.env.VITE_PREFER_STATIC_DATA as string | undefined) || '').toLowerCase() === 'true';
const AUTH_SESSION_STORAGE_KEY = 'taigi_web_session_token';

if (API_BASE_URL) {
  axios.defaults.baseURL = API_BASE_URL;
}

function setAuthSessionToken(token: string | null) {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    try {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, token);
    } catch {
      // Cookie auth may still work when localStorage is unavailable.
    }
  } else {
    delete axios.defaults.headers.common.Authorization;
    try {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage failures during logout.
    }
  }
}

try {
  const storedSessionToken = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (storedSessionToken) setAuthSessionToken(storedSessionToken);
} catch {
  // Ignore storage failures; the server cookie remains the primary auth path.
}

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
    siteName: '台語語音影片網',
    subtitle: '中文稿 → 台語稿 → 語音 → 字幕波形影片',
    work: '工作',
    jobs: '工作總覽',
    lexicon: '語詞資料庫',
    stats: '統計趨勢',
    sources: '資料來源與授權',
    about: '關於',
    preferences: '偏好設定',
    refresh: '重新整理',
    signOut: '登出',
    dateTimeFormat: '時間格式',
    dateSystem: '系統',
    dateTaiwan: '台灣',
    dateUs: '美式',
    dateIso: 'ISO',
    segmentUnit: '段',
    createdLabel: '建立',
    elapsedLabel: '耗時',
    ratingLabel: '平均',
    voteUnit: '票',
    secondsUnit: '秒',
    minutesUnit: '分',
    hoursUnit: '小時',
    canSubmit: '可以送出',
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
    itaigiReference: '開啟 iTaigi 參考',
    itaigiReferenceHint: '先開啟 iTaigi 人工查詢比較講法；不會自動匯入外部資料。',
    sourcesTitle: '資料來源與授權',
    requestCorpus: '申請多語系語料',
    multilingualCorpus: '多語系語料',
    pendingReview: '待補稿',
    draft: '草稿',
    aboutTitle: '關於台語語音影片網',
    aboutIntro: '這個專案把中文稿轉成台語文字與台羅輔助稿，再分段產生語音、字幕與音訊波形影片，方便做台語內容製作、校稿、詞庫整理與語音品質回饋。',
    aboutFlowTitle: '核心流程',
    aboutFlowText: '輸入中文稿後，系統會產生台語稿與台羅，切成可檢查的段落，逐段生成語音，最後合併成完整音訊與字幕影片。',
    aboutReviewTitle: '校稿與再生成',
    aboutReviewText: '使用者可以對整段、單一分段、語詞與語音版本評分，留下修正後台語文字或台羅，並把需要修正的段落重新排入佇列生成。',
    aboutLexiconTitle: '語詞資料庫',
    aboutLexiconText: '語詞與固定語句可查詢、播放、評分、重新產生語音，也能針對長語句斷詞標示有問題或沒問題的詞彙。',
    aboutProjectTitle: '專案網址',
    aboutProjectText: '本專案基於 VoxCPM 延伸成台語語音影片與詞庫工作介面。',
  },
  'zh-Hans': {
    siteName: '台语语音影片网',
    subtitle: '中文稿 → 台语稿 → 语音 → 字幕波形影片',
    work: '工作',
    jobs: '工作总览',
    lexicon: '词语数据库',
    stats: '统计趋势',
    sources: '来源授权',
    about: '关于',
    preferences: '偏好设置',
    refresh: '刷新',
    signOut: '登出',
    dateTimeFormat: '时间格式',
    dateSystem: '系统',
    dateTaiwan: '台湾',
    dateUs: '美式',
    dateIso: 'ISO',
    segmentUnit: '段',
    createdLabel: '建立',
    elapsedLabel: '耗时',
    ratingLabel: '平均',
    voteUnit: '票',
    secondsUnit: '秒',
    minutesUnit: '分',
    hoursUnit: '小时',
    canSubmit: '可以送出',
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
    itaigiReference: '打开 iTaigi 参考',
    itaigiReferenceHint: '先打开 iTaigi 人工查询比较说法；不会自动导入外部资料。',
    sourcesTitle: '数据来源与授权',
    requestCorpus: '申请多语系语料',
    multilingualCorpus: '多语系语料',
    pendingReview: '待补稿',
    draft: '草稿',
    aboutTitle: '关于台语语音影片网',
    aboutIntro: '这个项目把中文稿转换成台语文字与台罗辅助稿，再分段产生语音、字幕与音讯波形影片，方便做台语内容制作、校稿、词库整理与语音品质回馈。',
    aboutFlowTitle: '核心流程',
    aboutFlowText: '输入中文稿后，系统会产生台语稿与台罗，切成可检查的段落，逐段生成语音，最后合并成完整音讯与字幕影片。',
    aboutReviewTitle: '校稿与再生成',
    aboutReviewText: '使用者可以对整段、单一分段、词语与语音版本评分，留下修正后台语文字或台罗，并把需要修正的段落重新排入队列生成。',
    aboutLexiconTitle: '词语数据库',
    aboutLexiconText: '词语与固定语句可查询、播放、评分、重新产生语音，也能针对长语句断词标示有问题或没问题的词汇。',
    aboutProjectTitle: '项目网址',
    aboutProjectText: '本项目基于 VoxCPM 延伸成台语语音影片与词库工作界面。',
  },
  en: {
    siteName: 'Taigi Voice Video Web',
    subtitle: 'Chinese draft → Taigi draft → Speech → Captioned waveform video',
    work: 'Work',
    jobs: 'Jobs',
    lexicon: 'Lexicon',
    stats: 'Stats',
    sources: 'Sources',
    about: 'About',
    preferences: 'Preferences',
    refresh: 'Refresh',
    signOut: 'Sign out',
    dateTimeFormat: 'Time format',
    dateSystem: 'System',
    dateTaiwan: 'Taiwan',
    dateUs: 'US',
    dateIso: 'ISO',
    segmentUnit: 'segments',
    createdLabel: 'Created',
    elapsedLabel: 'Duration',
    ratingLabel: 'Average',
    voteUnit: 'votes',
    secondsUnit: 'sec',
    minutesUnit: 'min',
    hoursUnit: 'hr',
    canSubmit: 'Ready',
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
    itaigiReference: 'Open iTaigi reference',
    itaigiReferenceHint: 'Open iTaigi for manual comparison first; external data is not imported automatically.',
    sourcesTitle: 'Data Sources and Licenses',
    requestCorpus: 'Request multilingual corpus',
    multilingualCorpus: 'Multilingual corpus',
    pendingReview: 'Pending',
    draft: 'Draft',
    aboutTitle: 'About Taigi Voice Video Web',
    aboutIntro: 'This project turns Chinese drafts into Taigi text and Tailo helper text, then generates segmented speech, captions, and waveform videos for Taigi content production, review, lexicon work, and audio quality feedback.',
    aboutFlowTitle: 'Core workflow',
    aboutFlowText: 'After a Chinese draft is entered, the system creates Taigi and Tailo text, splits it into reviewable segments, generates speech segment by segment, and combines everything into complete audio and a captioned video.',
    aboutReviewTitle: 'Review and regeneration',
    aboutReviewText: 'Users can rate full jobs, individual segments, lexicon entries, and audio versions, save corrected Taigi or Tailo text, and queue corrected segments for regeneration.',
    aboutLexiconTitle: 'Lexicon database',
    aboutLexiconText: 'Words and fixed phrases can be searched, played, rated, regenerated, and segmented so problematic words inside longer phrases can be marked clearly.',
    aboutProjectTitle: 'Project URL',
    aboutProjectText: 'This project extends VoxCPM into a Taigi voice video and lexicon workflow interface.',
  },
  ja: {
    siteName: '台湾語音声動画ウェブ',
    subtitle: '中国語原稿 → 台湾語原稿 → 音声 → 字幕付き波形動画',
    work: '作成',
    jobs: 'ジョブ一覧',
    lexicon: '語彙データベース',
    stats: '統計',
    sources: '出典',
    about: '概要',
    preferences: '設定',
    refresh: '更新',
    signOut: 'サインアウト',
    dateTimeFormat: '日時形式',
    dateSystem: 'システム',
    dateTaiwan: '台湾',
    dateUs: '米国',
    dateIso: 'ISO',
    segmentUnit: '段落',
    createdLabel: '作成',
    elapsedLabel: '所要時間',
    ratingLabel: '平均',
    voteUnit: '票',
    secondsUnit: '秒',
    minutesUnit: '分',
    hoursUnit: '時間',
    canSubmit: '送信可能',
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
    itaigiReference: 'iTaigi 参照を開く',
    itaigiReferenceHint: 'まず iTaigi を開いて手動で表現を比較します。外部データは自動取り込みしません。',
    sourcesTitle: '出典とライセンス',
    requestCorpus: '多言語コーパス申請',
    multilingualCorpus: '多言語コーパス',
    pendingReview: '未翻訳',
    draft: '草稿',
    aboutTitle: '台湾語音声動画ウェブについて',
    aboutIntro: 'このプロジェクトは中国語原稿を台湾語本文と台羅補助文に変換し、分割音声、字幕、音声波形動画を生成します。台湾語コンテンツ制作、校正、語彙整理、音声品質フィードバックに使えます。',
    aboutFlowTitle: '基本フロー',
    aboutFlowText: '中国語原稿を入力すると、システムが台湾語本文と台羅を生成し、確認しやすい段落に分割して、段落ごとに音声を生成し、最後に音声と字幕動画を結合します。',
    aboutReviewTitle: '校正と再生成',
    aboutReviewText: '全体、各段落、語彙、音声バージョンを評価し、修正後の台湾語本文や台羅を保存して、必要な段落をキューに戻して再生成できます。',
    aboutLexiconTitle: '語彙データベース',
    aboutLexiconText: '語彙と定型句は検索、再生、評価、音声再生成ができ、長い句の中で問題のある語を分かち書き単位で明示できます。',
    aboutProjectTitle: 'プロジェクト URL',
    aboutProjectText: 'このプロジェクトは VoxCPM を台湾語音声動画と語彙作業のインターフェースとして拡張したものです。',
  },
  ko: {
    siteName: '대만어 음성 영상 웹',
    subtitle: '중국어 원고 → 대만어 원고 → 음성 → 자막 파형 영상',
    work: '작업',
    jobs: '작업 목록',
    lexicon: '어휘 데이터베이스',
    stats: '통계',
    sources: '출처',
    about: '소개',
    preferences: '설정',
    refresh: '새로고침',
    signOut: '로그아웃',
    dateTimeFormat: '시간 형식',
    dateSystem: '시스템',
    dateTaiwan: '대만',
    dateUs: '미국식',
    dateIso: 'ISO',
    segmentUnit: '구간',
    createdLabel: '생성',
    elapsedLabel: '소요 시간',
    ratingLabel: '평균',
    voteUnit: '표',
    secondsUnit: '초',
    minutesUnit: '분',
    hoursUnit: '시간',
    canSubmit: '제출 가능',
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
    itaigiReference: 'iTaigi 참고 열기',
    itaigiReferenceHint: '먼저 iTaigi를 열어 수동으로 표현을 비교합니다. 외부 데이터는 자동으로 가져오지 않습니다.',
    sourcesTitle: '자료 출처와 라이선스',
    requestCorpus: '다국어 말뭉치 신청',
    multilingualCorpus: '다국어 말뭉치',
    pendingReview: '대기',
    draft: '초안',
    aboutTitle: '대만어 음성 영상 웹 소개',
    aboutIntro: '이 프로젝트는 중국어 원고를 대만어 문장과 Tailo 보조문으로 바꾸고, 분할 음성, 자막, 오디오 파형 영상을 생성하여 대만어 콘텐츠 제작, 검수, 어휘 정리, 음성 품질 피드백에 활용합니다.',
    aboutFlowTitle: '핵심 흐름',
    aboutFlowText: '중국어 원고를 입력하면 시스템이 대만어와 Tailo 텍스트를 만들고, 검토 가능한 단위로 나눈 뒤, 구간별 음성을 생성하고 최종 오디오와 자막 영상을 합칩니다.',
    aboutReviewTitle: '검수와 재생성',
    aboutReviewText: '전체 작업, 개별 구간, 어휘, 음성 버전에 평점을 남기고 수정된 대만어 또는 Tailo를 저장한 뒤 필요한 구간을 다시 큐에 넣어 생성할 수 있습니다.',
    aboutLexiconTitle: '어휘 데이터베이스',
    aboutLexiconText: '어휘와 고정 표현은 검색, 재생, 평점, 음성 재생성이 가능하며 긴 표현 안의 문제가 있는 단어를 분절 단위로 표시할 수 있습니다.',
    aboutProjectTitle: '프로젝트 URL',
    aboutProjectText: '이 프로젝트는 VoxCPM을 대만어 음성 영상과 어휘 작업 인터페이스로 확장한 것입니다.',
  },
  taigi: {
    siteName: '台語聲音影片網',
    subtitle: '華語稿 → 台語稿 → 聲音 → 字幕波形影片',
    work: '工課',
    jobs: '工課總覽',
    lexicon: '語詞資料庫',
    stats: '統計趨勢',
    sources: '資料來源佮授權',
    about: '關於',
    preferences: '偏好設定',
    refresh: '閣整理',
    signOut: '登出',
    dateTimeFormat: '時間格式',
    dateSystem: '系統',
    dateTaiwan: '台灣',
    dateUs: '美式',
    dateIso: 'ISO',
    segmentUnit: '段',
    createdLabel: '建立',
    elapsedLabel: '開偌久',
    ratingLabel: '平均',
    voteUnit: '票',
    secondsUnit: '秒',
    minutesUnit: '分',
    hoursUnit: '點鐘',
    canSubmit: '會當送出',
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
    itaigiReference: '開 iTaigi 參考',
    itaigiReferenceHint: '先開 iTaigi 人工查詢比較講法；袂自動匯入外部資料。',
    sourcesTitle: '資料來源佮授權',
    requestCorpus: '申請多語系語料',
    multilingualCorpus: '多語系語料',
    pendingReview: '咧等補稿',
    draft: '草稿',
    aboutTitle: '關於台語聲音影片網',
    aboutIntro: '這个專案共華語稿轉做台語文字佮台羅輔助稿，閣分段產生聲音、字幕佮音訊波形影片，方便做台語內容、校稿、整理語詞資料庫佮回饋聲音品質。',
    aboutFlowTitle: '核心流程',
    aboutFlowText: '輸入華語稿了後，系統會產生台語稿佮台羅，切做會當檢查的段落，逐段產生聲音，最後合做完整音訊佮字幕影片。',
    aboutReviewTitle: '校稿佮閣再生成',
    aboutReviewText: '使用者會當對規段、單一分段、語詞佮聲音版本評分，留修正後台語文字抑是台羅，閣共愛修正的段落排入佇列重做。',
    aboutLexiconTitle: '語詞資料庫',
    aboutLexiconText: '語詞佮固定語句會當查詢、播放、評分、閣再產生聲音，也會當對較長的語句斷詞標示有問題抑是無問題的詞。',
    aboutProjectTitle: '專案網址',
    aboutProjectText: '本專案是佇 VoxCPM 的基礎頂懸，延伸做台語聲音影片佮語詞資料庫的工課介面。',
  },
  tailo: {
    siteName: 'Tâi-gí siann-im iánn-phìnn bāng',
    subtitle: 'Huâ-gí khó → Tâi-gí khó → Siann-im → Jī-bō 波形影片',
    work: 'Kang-khò',
    jobs: 'Kang-khò chóng-lám',
    lexicon: 'Gí-sû tsu-liāu-khòo',
    stats: 'Thong-kè',
    sources: 'Guân-thâu',
    about: 'Kuan-î',
    preferences: 'Phiàn-hó siat-tīng',
    refresh: 'Koh tsíng-lí',
    signOut: 'Teng-tshut',
    dateTimeFormat: 'Sî-kan keh-sik',
    dateSystem: 'Hē-thóng',
    dateTaiwan: 'Tâi-uân',
    dateUs: 'Bí-sik',
    dateIso: 'ISO',
    segmentUnit: 'tuānn',
    createdLabel: 'Kiàn-li̍p',
    elapsedLabel: 'Hùi-sî',
    ratingLabel: 'Pîng-kun',
    voteUnit: 'phiò',
    secondsUnit: 'bió',
    minutesUnit: 'hun',
    hoursUnit: 'tiám-tsing',
    canSubmit: 'Ē-tàng sàng-tshut',
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
    itaigiReference: 'Khui iTaigi tsham-khó',
    itaigiReferenceHint: 'Sing khui iTaigi lâng-kang tshiau-tshuē pí-kàu; bē tsū-tōng huī-ji̍p guā-pōo tsu-liāu.',
    sourcesTitle: 'Tsu-liāu guân-thâu kap sû-khuân',
    requestCorpus: 'Tshing-kiû tō-gí-hē gí-liāu',
    multilingualCorpus: 'Tō-gí-hē gí-liāu',
    pendingReview: 'Tán póo-kó',
    draft: 'Tsháu-kó',
    aboutTitle: 'Kuan-î Tâi-gí siann-im iánn-phìnn bāng',
    aboutIntro: 'Tsit-ê tsuan-àn kā Huâ-gí khó tsuán-tsò Tâi-gí bûn-jī kap Tâi-lô hû-tsōo khó, koh hun-tuānn sán-sing siann-im, jī-bō kap im-sìn ph波形 iánn-phìnn.',
    aboutFlowTitle: 'Hik-sim lâu-thîng',
    aboutFlowText: 'Su-ji̍p Huâ-gí khó āu, hē-thóng ē sán-sing Tâi-gí khó kap Tâi-lô, tshiat tsò ē-tàng kiám-tsha ê tuānn-lo̍h,逐段 sán-sing siann-im, tsuè-āu ha̍p-tsò uân-tsíng im-sìn kap jī-bō iánn-phìnn.',
    aboutReviewTitle: 'Kàu-kó kap koh sán-sing',
    aboutReviewText: 'Sú-iōng-tsiá ē-tàng tuì tsuân-tuānn, tan-it hun-tuānn, gí-sû kap siann-im pán-pún phîng-hun, lâu siu-tsìng āu ê Tâi-gí bûn-jī á-sī Tâi-lô, koh kā ài siu-tsìng ê tuānn-lo̍h pâi ji̍p tuī-lia̍t koh-tsò.',
    aboutLexiconTitle: 'Gí-sû tsu-liāu-khòo',
    aboutLexiconText: 'Gí-sû kap kòo-tīng gí-kù ē-tàng tshiau, pòo-hòng, phîng-hun, koh sán-sing siann-im, mā ē-tàng tuì khah tn̂g ê gí-kù hun-sû phiau-sī ū būn-tê á-sī bô būn-tê ê sû.',
    aboutProjectTitle: 'Tsuan-àn bāng-tsí',
    aboutProjectText: 'Tsit-ê tsuan-àn tī VoxCPM ê ki-tshóo tíng-bīn iân-sin tsò Tâi-gí siann-im iánn-phìnn kap gí-sû tsu-liāu-khòo kang-khò kài-bīn.',
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
  | 'breezeAsr'
  | 'mmsTts'
  | 'seed'
  | 'userContribution'
  | 'moe'
  | 'itaigi'
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
  rows: Partial<Record<SourceRowKey, {
    statusTag: string;
    status: string;
    usage: string;
    governance: string;
  }>>;
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
    key: 'breezeAsr',
    section: 'tools',
    name: 'Breeze-ASR-26',
    note: '台語音訊校對與 ASR 對照。',
    color: 'success',
    links: [
      { label: 'Hugging Face', href: 'https://huggingface.co/MediaTek-Research/Breeze-ASR-26' },
      { label: 'Paper', href: 'https://huggingface.co/papers/2603.19259' },
    ],
  },
  {
    key: 'mmsTts',
    section: 'tools',
    name: 'MMS-TTS Min Nan',
    note: '非商用聲音對照，不作商業產出。',
    color: 'warning',
    links: [
      { label: 'MMS-TTS nan', href: 'https://huggingface.co/facebook/mms-tts-nan' },
      { label: 'MMS-TTS', href: 'https://huggingface.co/facebook/mms-tts' },
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
    name: 'ChhoeTaigi 社群資源',
    color: 'warning',
    links: [
      { label: 'ChhoeTaigi', href: 'https://chhoe.taigi.info/' },
      { label: 'ChhoeTaigiDatabase', href: 'https://github.com/ChhoeTaigi/ChhoeTaigiDatabase' },
    ],
  },
  {
    key: 'itaigi',
    section: 'dictionaries',
    name: 'iTaigi 群眾台語辭典',
    note: '本站目前只做人工查詢參考，不自動匯入。',
    color: 'warning',
    links: [
      { label: 'iTaigi', href: 'https://itaigi.tw/' },
      { label: 'GitHub', href: 'https://github.com/i3thuan5/itaigi' },
      { label: 'CC0', href: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      { label: 'API docs', href: 'http://docs.tai5uan5gian5gi2phing5thai5.apiary.io/#' },
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
    intro: '這裡整理每個工具、模型、辭源與公開資料庫的來源、授權狀態、本站用途與後續管理方式。「待確認」的資料只做人工查詢或校稿參考，不直接批次匯入、再散布或作為可下載資料庫。',
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
      breezeAsr: { statusTag: 'Apache-2.0', status: '模型卡標示 Apache-2.0。', usage: '可選用於音訊校對：將台語音訊轉寫後與原稿比對，產生 CER、相似度與疑似錯誤。', governance: '模型預設不自動下載；啟用前需固定模型版本、記錄模型連結與輸出為 AI 輔助校對。' },
      mmsTts: { statusTag: 'CC-BY-NC-4.0', status: 'Meta MMS-TTS-nan 為非商用授權。', usage: '只作非商用 A/B 對照聲音，不作本站商業產出，也不混入可下載資料庫。', governance: '預設關閉；若啟用，UI 與來源頁須標示非商用限制，公開服務不得把結果作商業用途。' },
      seed: { statusTag: '本站整理', status: '人工整理的起始資料。', usage: '作為查詢、測試、分詞與語音生成的初始詞庫。', governance: '每筆保留建立者、建立時間、後續修正與評分紀錄。' },
      userContribution: { statusTag: '使用者貢獻', status: '需在服務條款明示可用於改善本站資料庫。', usage: '建立轉譯記憶、語詞資料庫、音訊版本排序與品質評分。', governance: '匿名者保留匿名暱稱與歷史；登入者保留 email 識別；允許更改自己的評分。' },
      moe: { statusTag: '待正式確認', status: '可公開查詢與下載，但批次匯入、商用與再散布條件需逐項確認。', usage: '目前只作人工校稿與查詞參考，不自動大量匯入本站 SQLite。', governance: '正式匯入前記錄授權條款、下載日期、版本、引用文字與可否再散布。' },
      itaigi: { statusTag: '人工參考 / 匯入前審核', status: 'iTaigi 專案程式碼標示 MIT；服務條款提到資料庫與貢獻採 CC0 公眾領域貢獻宣告。仍需在本站正式匯入前保留逐筆來源與版本紀錄。', usage: '在詞庫搜尋無精確符合時開啟 iTaigi 查詢，供校稿者比較台語講法與候選詞。', governance: '目前不自動爬取、不批次匯入。若未來匯入，需保存 source_url、license_url、retrieved_at、原始欄位與人工審核紀錄。' },
      chhoeTaigi: { statusTag: '待資料集逐項確認', status: '不同子資料來源可能有不同授權。', usage: '作為人工查詞、比較譯法與候選語詞整理參考。', governance: '若要匯入，需只匯入授權明確且允許本站用途的子集，並保留 source_id。' },
      external: { statusTag: '預設不得匯入', status: '除非授權條款明確允許。', usage: '可供人類查閱後撰寫自己的修正，但不直接爬取或複製進資料庫。', governance: '新增來源前需通過授權欄位審核：license、commercial_use、redistribution、attribution。' },
    },
    rowNames: {
      seed: { name: '內建種子語詞', note: '逐家好、歹勢、毋免客氣、食果子拜樹頭等。' },
      userContribution: { name: '使用者查詢、生成、評分與修正', note: '本站使用過程自然累積。' },
      moe: { name: '教育部臺灣台語常用詞辭典' },
      itaigi: { name: 'iTaigi 群眾台語辭典', note: '以外部查詢方式輔助人工校稿。' },
      chhoeTaigi: { name: 'ChhoeTaigi 社群資源' },
      external: { name: '其他公開辭典、論文、語料與新聞內容', note: '未列入本站自動資料源。' },
    },
    alertTitle: '公開營運前的資料治理規則',
    alertDescription: '正式匯入外部資料前，每筆來源都要有 source_url、license_name、license_url、retrieved_at、version、commercial_use、redistribution、attribution_required 與 notes。未確認可再利用的資料只能做人工查詢參考，不批次匯入、不提供下載、不混入本站自有詞庫。',
  },
  'zh-Hans': {
    intro: '这里整理每个工具、模型、辞源与公开数据库的来源、授权状态、本站用途与后续管理方式。“待确认”的资料只做人工查询或校稿参考，不直接批量导入、再散布或作为可下载数据库。',
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
    intro: 'このページでは、各ツール、モデル、語彙出典、公開データベースの出典、ライセンス状態、サイト内での用途、必要な管理措置を整理します。「確認待ち」の資料は手作業の参照や校正だけに使い、一括取り込み、再配布、ダウンロード可能なデータベース化はしません。',
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
    intro: '這頁整理逐項工具、模型、辭源佮公開資料庫的來源、授權狀態、本站用途佮後續管理方式。「待確認」的資料干焦予人查詢、校稿參考，無直接大量匯入、閣散布，嘛無做做會下載的資料庫。',
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
    intro: 'Tsit ia̍h tsíng-lí muí tsi̍t hāng kang-kū, bôo-hîng, sû-guân kap kong-khui tsu-liāu-khòo ê guân-thâu, sû-khuân tsōng-thài, pún-tsām iōng-to͘ kap āu-sio̍k kuán-lí hong-sik. “Tán khak-jīn” ê tsu-liāu kan-na tsò jîn-kang tshiau-tshuē kap kàu-kó tsham-khó, bô pi̍t-tshiùnn huī-ji̍p, tsài sàn-pòo, á-sī tsò hóo-táng-tsài ê tsu-liāu-khòo.',
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
        const rowCopy = copy.rows[row.key] ?? SOURCE_COPY['zh-Hant'].rows[row.key] ?? SOURCE_COPY['zh-Hant'].rows.external!;
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

function initialDateTimeFormat(): DateTimeFormatPreference {
  try {
    const stored = window.localStorage.getItem('taigi_web_date_time_format') as DateTimeFormatPreference | null;
    if (stored && ['system', 'taiwan', 'us', 'iso'].includes(stored)) return stored;
  } catch {
    return 'system';
  }
  return 'system';
}

type JobStatus = 'queued' | 'running' | 'complete' | 'failed';
type CompletedJobSort = 'newest' | 'oldest' | 'rating' | 'plays' | 'duration' | 'title';
type JobKindFilter = 'all' | 'script' | 'segment_regeneration' | 'word_asset' | 'maintenance' | 'audio_review';
type CompletedJobContentFilter = 'all' | 'long_article' | 'short_word_audio';
type CompletedJobRatingFilter = 'all' | 'rated' | 'unrated';
type CompletedJobMediaFilter = 'all' | 'video' | 'audio';
type CompletedJobIssueFilter = 'all' | 'problem' | 'chinese_voice_not_taigi' | 'ok' | 'unreviewed';
type WordSort = 'rating' | 'newest' | 'plays' | 'usage' | 'source';
type WordKindFilter = 'all' | 'word' | 'phrase';
type WordRatingFilter = 'all' | 'rated' | 'unrated';
type WordMediaFilter = 'all' | 'audio' | 'video' | 'missing_audio';
type WordStatusFilter = 'all' | 'problem' | 'ok' | 'generating' | 'requested';
type DateTimeFormatPreference = 'system' | 'taiwan' | 'us' | 'iso';
type SynthesisSource = 'taigi' | 'tailo';
type ProblemType = '' | 'chinese_voice_not_taigi';
type RatingBuckets = Record<'1' | '2' | '3' | '4' | '5', number>;

interface Job {
  id: string;
  kind?: 'script' | 'word_asset' | 'segment_regeneration' | 'maintenance' | 'audio_review';
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
  problem?: boolean;
  problem_type?: ProblemType | string;
  problem_reason?: string;
  problem_reported_at?: number | null;
  featured_at?: number | null;
  featured_by?: string;
  featured_note?: string;
  metadata?: Record<string, unknown>;
  static_media?: Record<string, string>;
}

interface PaginatedJobsResponse {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
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
  last_synthesis_text?: string;
  last_synthesis_source?: string;
  source_tokens?: SegmentToken[];
  audio_review?: AudioReviewSegment;
}

interface AudioReviewSegment {
  index: number;
  reference_text?: string;
  asr_transcript?: string;
  comparison?: {
    cer?: number | null;
    similarity?: number | null;
    edit_distance?: number | null;
    reference_length?: number;
  };
  issues?: string[];
  asr_status?: { available?: boolean; reason?: string; model?: string };
  mms_status?: { available?: boolean; reason?: string; model?: string; audio_file?: string };
}

interface SegmentToken {
  source: string;
  taigi: string;
  tailo: string;
  word_id?: string;
  exists?: boolean;
  problem?: boolean;
  has_audio?: boolean;
  has_video?: boolean;
  generation_status?: string;
  review_status?: 'problem' | 'ok' | '';
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
    status?: 'problem' | 'ok' | '';
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

interface VerifyAuthResponse extends AuthStatus {
  session_token?: string;
  expires_at?: number;
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
  translator_backend?: 'rule' | 'tw_hokkien_llm';
  tw_hokkien_llm_translator_enabled?: boolean;
  pipeline: string[];
}

interface AdminSettings {
  default_reference_voice_mode: 'default' | 'random';
  public_rate_limit_seconds: number;
  api_access_token: string;
  postgres_dsn: string;
  postgres_schema: string;
  translator_backend: 'rule' | 'tw_hokkien_llm';
  translator_api_base_url: string;
  translator_api_key: string;
  translator_model: string;
  translator_target_language: 'HAN' | 'HL' | 'POJ';
  translator_timeout_seconds: number;
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

interface TermBatchRegenerateResult {
  dry_run: boolean;
  search_term: string;
  taigi_replacement: string;
  match_count: number;
  regeneratable_count: number;
  matched_jobs: Array<{
    job_id: string;
    title: string;
    segment_count: number;
    regeneratable_count: number;
  }>;
  queued_jobs: Job[];
}

interface QueueStatus {
  authenticated: boolean;
  private_client: boolean;
  rate_limit: {
    limit_seconds: number;
    wait_seconds: number;
    can_submit: boolean;
    next_available_at: number;
    sentence_limit?: number | null;
    max_chars?: number;
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
  problem_type?: ProblemType | string;
  problem_reason?: string;
  token_review_count?: number;
  token_problem_count?: number;
  token_ok_count?: number;
  token_problem_sources?: string[];
  token_ok_sources?: string[];
  has_audio?: boolean;
  has_video?: boolean;
  generation_status?: 'idle' | 'queued' | 'running' | 'complete' | 'failed';
  generation_stage?: string;
  generation_progress?: number;
  generation_error?: string;
  generation_position?: number;
  generation_job_id?: string;
  assets?: WordAsset[];
  itaigi_reference?: ItaigiReferenceCandidate;
  source_tokens?: SegmentToken[];
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
  updated_at?: number;
  generated_at?: number;
}

interface PaginatedWordsResponse {
  words: WordEntry[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface ItaigiReferenceCandidate {
  id?: string;
  taigi: string;
  tailo: string;
  contributor?: string;
  good?: number;
  bad?: number;
  score?: number;
  audio_url?: string;
  audio_available?: boolean;
  source_url?: string;
}

interface ItaigiReferenceResult {
  source: string;
  query: string;
  source_url: string;
  api_url: string;
  license_note?: string;
  candidates: ItaigiReferenceCandidate[];
}

interface WordAsset {
  id: string;
  has_audio?: boolean;
  has_video?: boolean;
  synthesis_text?: string;
  synthesis_source?: string;
  matches_current_reference?: boolean;
  matches_current_word?: boolean;
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
  page_visits_total?: number;
  page_visits_today?: number;
  job_quality?: {
    completed_total: number;
    reviewed_total: number;
    problem_count: number;
    chinese_voice_not_taigi_count?: number;
    ok_count: number;
    unreviewed_count: number;
    problem_rate: number;
    ok_rate: number;
    reviewed_rate: number;
    unreviewed_rate: number;
  };
  lexicon_quality?: {
    word_entries_total: number;
    word_entries_rated: number;
    word_entries_unrated: number;
    word_assets_total: number;
    word_assets_rated: number;
    word_assets_unrated: number;
    word_entry_rating_buckets?: RatingBuckets;
    word_asset_rating_buckets?: RatingBuckets;
    word_problem_count: number;
    word_problem_rate: number;
    word_token_reviewed_entries?: number;
    word_token_problem_entries?: number;
    word_token_problem_count?: number;
    word_token_ok_count?: number;
    segment_token_problem_count?: number;
    segment_token_ok_count?: number;
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
    audio_review_requests?: number;
    audio_review_complete?: number;
    audio_review_queued?: number;
    audio_review_running?: number;
    audio_review_failed?: number;
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
  { key: 'translate', label: '翻譯', color: '#1b63f0', match: ['Translating'] },
  { key: 'segment', label: '分段', color: '#21c8c1', match: ['Splitting', 'Loading source'] },
  { key: 'tts', label: '語音', color: '#19b795', match: ['Generating audio', 'Regenerating audio'] },
  { key: 'join', label: '合併', color: '#5d86f7', match: ['Joining'] },
  { key: 'subtitle', label: '字幕', color: '#6c4be8', match: ['Preparing'] },
  { key: 'video', label: '影片', color: '#59c36a', match: ['Rendering'] },
  { key: 'package', label: '打包', color: '#23b7d5', match: ['Packaging'] },
];
const ratingScores = [5, 4, 3, 2, 1] as const;

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

const dateTimeLocales: Record<DateTimeFormatPreference, string | undefined> = {
  system: undefined,
  taiwan: 'zh-TW',
  us: 'en-US',
  iso: 'sv-SE',
};

function formatWait(seconds: number) {
  if (seconds <= 0) return '可以送出';
  return formatDuration(seconds) ?? '可以送出';
}

function formatStableWait(seconds: number) {
  if (seconds <= 1) return '可以送出';
  return formatDuration(Math.ceil(seconds)) ?? '可以送出';
}

function inlineText(value: string) {
  return value.replace(/\s*\n+\s*/g, ' ').trim();
}

function firstSentence(value: string, limit = 56) {
  const cleaned = inlineText(value);
  const first = cleaned.match(/^.*?[。！？!?]/)?.[0] ?? cleaned;
  return first.length > limit ? `${first.slice(0, limit)}...` : first;
}

function shouldDefaultMakeVideo(text: string) {
  const cleaned = inlineText(text);
  const sentenceCount = (cleaned.match(/[。！？!?]/g) ?? []).length;
  return cleaned.length >= 120 || sentenceCount >= 2;
}

function activeStepIndex(job?: Job | null) {
  if (!job) return -1;
  if (job.status === 'complete') return pipelineSteps.length;
  if (job.status === 'failed') return -1;
  if (job.status === 'queued') return -1;
  return pipelineSteps.findIndex((step) => step.match.some((marker) => job.stage.includes(marker)));
}

function jobKindLabel(job: Job, t: (key: string) => string) {
  if (job.kind === 'word_asset') return t('jobKindWord');
  if (job.kind === 'segment_regeneration') return '重生分段';
  if (job.kind === 'maintenance') return '維護清理';
  if (job.kind === 'audio_review') return '音訊校對';
  return t('jobKindScript');
}

function jobKindColor(job: Job) {
  if (job.kind === 'word_asset') return 'purple';
  if (job.kind === 'segment_regeneration') return 'magenta';
  if (job.kind === 'maintenance') return 'geekblue';
  if (job.kind === 'audio_review') return 'cyan';
  return 'cyan';
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

const LIVE_JOBS_POLL_INTERVAL_MS = 60000;
const LIVE_STATUS_POLL_INTERVAL_MS = 60000;
const DEFAULT_PAGE_SIZE = 10;

function validPageTab(value: string | null) {
  return value === 'work'
    || value === 'jobs'
    || value === 'lexicon'
    || value === 'stats'
    || value === 'sources'
    || value === 'about'
    || value === 'preferences';
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

function itaigiSearchUrl(query: string) {
  return `https://itaigi.tw/k/${encodeURIComponent(query.trim())}`;
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
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsHasMore, setJobsHasMore] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [completedJobSort, setCompletedJobSort] = useState<CompletedJobSort>('newest');
  const [completedJobKindFilter, setCompletedJobKindFilter] = useState<JobKindFilter>('script');
  const [completedJobContentFilter, setCompletedJobContentFilter] = useState<CompletedJobContentFilter>('long_article');
  const [completedJobRatingFilter, setCompletedJobRatingFilter] = useState<CompletedJobRatingFilter>('all');
  const [completedJobMediaFilter, setCompletedJobMediaFilter] = useState<CompletedJobMediaFilter>('video');
  const [completedJobIssueFilter, setCompletedJobIssueFilter] = useState<CompletedJobIssueFilter>('all');
  const [showQueuedJobs, setShowQueuedJobs] = useState(false);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [wordsTotal, setWordsTotal] = useState(0);
  const [wordsHasMore, setWordsHasMore] = useState(false);
  const [loadingWords, setLoadingWords] = useState(false);
  const [wordQuery, setWordQuery] = useState('');
  const [wordSort, setWordSort] = useState<WordSort>('rating');
  const [wordKindFilter, setWordKindFilter] = useState<WordKindFilter>('all');
  const [wordRatingFilter, setWordRatingFilter] = useState<WordRatingFilter>('all');
  const [wordMediaFilter, setWordMediaFilter] = useState<WordMediaFilter>('all');
  const [wordStatusFilter, setWordStatusFilter] = useState<WordStatusFilter>('all');
  const [expandedWordIds, setExpandedWordIds] = useState<Record<string, boolean>>({});
  const [selectedWordTokens, setSelectedWordTokens] = useState<Record<string, string[]>>({});
  const [itaigiReferences, setItaigiReferences] = useState<Record<string, ItaigiReferenceResult>>({});
  const [loadingItaigiReferences, setLoadingItaigiReferences] = useState<Record<string, boolean>>({});
  const [applyingItaigiReferences, setApplyingItaigiReferences] = useState<Record<string, boolean>>({});
  const [generatingWordVideos, setGeneratingWordVideos] = useState<Record<string, boolean>>({});
  const wordQueryRef = useRef('');
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(initialUiLanguage);
  const [dateTimeFormat, setDateTimeFormat] = useState<DateTimeFormatPreference>(initialDateTimeFormat);
  const [activeTab, setActiveTab] = useState(initialPageTab);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentJobId, setSegmentJobId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, SegmentReviewPayload>>({});
  const [selectedSegmentTokens, setSelectedSegmentTokens] = useState<Record<number, string[]>>({});
  const [regeneratingSegments, setRegeneratingSegments] = useState<Record<number, boolean>>({});
  const [segmentSynthesisSources, setSegmentSynthesisSources] = useState<Record<number, SynthesisSource>>({});
  const [wordSynthesisSources, setWordSynthesisSources] = useState<Record<string, SynthesisSource>>({});
  const [jobError, setJobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSentence, setGeneratingSentence] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingReviewed, setRegeneratingReviewed] = useState(false);
  const [reviewingAudio, setReviewingAudio] = useState(false);
  const [retryingJobs, setRetryingJobs] = useState<Record<string, boolean>>({});
  const [fullRegeneratingJobs, setFullRegeneratingJobs] = useState<Record<string, boolean>>({});
  const [exportingPostgres, setExportingPostgres] = useState(false);
  const [postgresExportResult, setPostgresExportResult] = useState<PostgresExportResult | null>(null);
  const [syncingStatic, setSyncingStatic] = useState(false);
  const [staticSyncResult, setStaticSyncResult] = useState<StaticSyncResult | null>(null);
  const [termSearch, setTermSearch] = useState('美元');
  const [termReplacement, setTermReplacement] = useState('美金');
  const [termBatchResult, setTermBatchResult] = useState<TermBatchRegenerateResult | null>(null);
  const [runningTermBatch, setRunningTermBatch] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [requestingSourceExport, setRequestingSourceExport] = useState(false);
  const [sourceRequestWord, setSourceRequestWord] = useState('');
  const [sourceRequestNote, setSourceRequestNote] = useState('');
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const [form] = Form.useForm<FormValues>();
  const autoVideoDefaultRef = useRef(true);
  const syncingVideoDefaultRef = useRef(false);
  const detachedAudioRef = useRef<HTMLAudioElement | null>(null);

  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeWords = Array.isArray(words) ? words : [];
  const selectedJob = useMemo(
    () => safeJobs.find((job) => job.id === selectedJobId) ?? null,
    [safeJobs, selectedJobId],
  );

  const signedIn = !!auth?.authenticated;
  const isAdmin = !!auth?.is_admin;
  const t = (key: string) => UI_TEXT[uiLanguage]?.[key] ?? UI_TEXT['zh-Hant'][key] ?? key;
  const actionLabel = (key: string) => ACTION_TEXT[uiLanguage]?.[key] ?? ACTION_TEXT['zh-Hant'][key] ?? key;
  const formatDateTime = (value: number) => {
    const date = new Date(value * 1000);
    if (dateTimeFormat === 'iso') {
      return new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }
    return new Intl.DateTimeFormat(dateTimeLocales[dateTimeFormat], {
      year: dateTimeFormat === 'system' ? undefined : 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  const formatDurationText = (seconds?: number | null) => {
    if (seconds === null || seconds === undefined) return null;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} ${t('secondsUnit')}`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    if (minutes < 60) return `${minutes} ${t('minutesUnit')} ${rest} ${t('secondsUnit')}`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} ${t('hoursUnit')} ${mins} ${t('minutesUnit')}`;
  };
  const formatRatingText = (average?: number | null, count?: number) => (
    count ? `${t('ratingLabel')} ${average?.toFixed(1)} / 5（${count} ${t('voteUnit')}）` : ''
  );
  const formatPercent = (value?: number | null) => `${Math.round((value || 0) * 100)}%`;
  const problemTypeLabel = (problemType?: string) => (
    problemType === 'chinese_voice_not_taigi' ? '中文語音未轉台語' : ''
  );
  const ProblemTypeTag = ({ problemType }: { problemType?: string }) => {
    const label = problemTypeLabel(problemType);
    return label ? <Tag color="volcano" className="issue-type-tag">{label}</Tag> : null;
  };
  const formatJobMeta = (job: Job) => ([
    `${job.segment_count || 0} ${t('segmentUnit')}`,
    `${t('createdLabel')} ${formatDateTime(job.created_at)}`,
    formatDurationText(job.elapsed_seconds) ? `${t('elapsedLabel')} ${formatDurationText(job.elapsed_seconds)}` : '',
    formatRatingText(job.rating_average, job.rating_count),
  ].filter(Boolean).join(' · '));
  const jobDisplayTitle = (job: Job) => (job.kind === 'segment_regeneration' ? job.title : firstSentence(job.chinese_text) || job.title);
  const isLongArticleJob = (job: Job) => (
    job.kind === 'script'
    && ((job.segment_count ?? 0) > 1 || inlineText(job.chinese_text || job.taigi_text || job.title).length >= 120)
  );
  const isShortWordAudioJob = (job: Job) => job.kind === 'word_asset';
  const jobMatchesContentFilter = (job: Job, filter: CompletedJobContentFilter) => {
    if (filter === 'long_article') return isLongArticleJob(job);
    if (filter === 'short_word_audio') return isShortWordAudioJob(job);
    return true;
  };
  const jobMarkedOk = (job: Job) => !job.problem && !!job.problem_reported_at;
  const jobMatchesIssueFilter = (job: Job, filter: CompletedJobIssueFilter) => {
    if (filter === 'problem') return !!job.problem;
    if (filter === 'chinese_voice_not_taigi') return job.problem_type === 'chinese_voice_not_taigi';
    if (filter === 'ok') return jobMarkedOk(job);
    if (filter === 'unreviewed') return !job.problem && !job.problem_reported_at;
    return true;
  };
  const newestFirst = (a: Job, b: Job) => (b.created_at || b.updated_at || 0) - (a.created_at || a.updated_at || 0);
  const highestRatedFirst = (a: Job, b: Job) => {
    const ratingDelta = (b.rating_average || 0) - (a.rating_average || 0);
    if (ratingDelta) return ratingDelta;
    const ratingCountDelta = (b.rating_count || 0) - (a.rating_count || 0);
    if (ratingCountDelta) return ratingCountDelta;
    return newestFirst(a, b);
  };
  const newestWordFirst = (a: WordEntry, b: WordEntry) => (b.updated_at || b.generated_at || 0) - (a.updated_at || a.generated_at || 0);
  const highestRatedWordFirst = (a: WordEntry, b: WordEntry) => {
    const ratingDelta = (b.rating_average || 0) - (a.rating_average || 0);
    if (ratingDelta) return ratingDelta;
    const ratingCountDelta = (b.rating_count || 0) - (a.rating_count || 0);
    if (ratingCountDelta) return ratingCountDelta;
    return newestWordFirst(a, b);
  };
  const jobMatchesSearch = (job: Job, query: string) => {
    const cleaned = query.trim().toLowerCase();
    if (!cleaned) return true;
    return [
      job.id,
      job.title,
      job.chinese_text,
      job.taigi_text,
      job.tailo_text,
      job.stage,
      job.error ?? '',
      problemTypeLabel(job.problem_type),
      job.problem_reason ?? '',
      jobKindLabel(job, t),
      job.status,
    ].some((value) => String(value || '').toLowerCase().includes(cleaned));
  };
  const completedJobs = useMemo(() => {
    const filtered = safeJobs.filter((job) => {
      if (job.status !== 'complete') return false;
      if (!jobMatchesSearch(job, jobSearch)) return false;
      if (completedJobKindFilter !== 'all' && job.kind !== completedJobKindFilter) return false;
      if (!jobMatchesContentFilter(job, completedJobContentFilter)) return false;
      if (!jobMatchesIssueFilter(job, completedJobIssueFilter)) return false;
      if (completedJobRatingFilter === 'rated' && !(job.rating_count && job.rating_count > 0)) return false;
      if (completedJobRatingFilter === 'unrated' && (job.rating_count && job.rating_count > 0)) return false;
      if (completedJobMediaFilter === 'video' && !job.video_path) return false;
      if (completedJobMediaFilter === 'audio' && !job.audio_path) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (completedJobSort === 'oldest') return (a.created_at || 0) - (b.created_at || 0);
      if (completedJobSort === 'rating') return highestRatedFirst(a, b);
      if (completedJobSort === 'plays') return (b.play_count || 0) - (a.play_count || 0) || newestFirst(a, b);
      if (completedJobSort === 'duration') return (b.elapsed_seconds || 0) - (a.elapsed_seconds || 0) || newestFirst(a, b);
      if (completedJobSort === 'title') return jobDisplayTitle(a).localeCompare(jobDisplayTitle(b), 'zh-Hant') || newestFirst(a, b);
      return newestFirst(a, b);
    });
  }, [safeJobs, jobSearch, completedJobKindFilter, completedJobContentFilter, completedJobIssueFilter, completedJobRatingFilter, completedJobMediaFilter, completedJobSort]);
  const jobGroups = useMemo(() => ([
    { key: 'running', label: '處理中', jobs: safeJobs.filter((job) => job.status === 'running').sort(newestFirst) },
    { key: 'queued', label: '隊列中', jobs: safeJobs.filter((job) => job.status === 'queued').sort(newestFirst), collapsed: !showQueuedJobs },
    { key: 'complete', label: '已完成', jobs: completedJobs },
    { key: 'failed', label: '失敗', jobs: safeJobs.filter((job) => job.status === 'failed' && jobMatchesSearch(job, jobSearch) && jobMatchesContentFilter(job, completedJobContentFilter)).sort(newestFirst) },
  ]), [safeJobs, completedJobs, jobSearch, completedJobContentFilter, showQueuedJobs]);
  const featuredJobs = useMemo(() => (
    safeJobs
      .filter((job) => job.status === 'complete' && !!job.featured_at)
      .sort((a, b) => (b.featured_at || 0) - (a.featured_at || 0))
  ), [safeJobs]);
  const normalizedWordQuery = wordQuery.trim().replace(/\s+/g, '').toLowerCase();
  const wordHasExactMatch = !!normalizedWordQuery && safeWords.some((word) => (
    word.source.trim().replace(/\s+/g, '').toLowerCase() === normalizedWordQuery
  ));
  const visibleWords = useMemo(() => {
    const filtered = safeWords.filter((word) => {
      if (wordKindFilter !== 'all' && (word.kind || 'word') !== wordKindFilter) return false;
      if (wordRatingFilter === 'rated' && !(word.rating_count && word.rating_count > 0)) return false;
      if (wordRatingFilter === 'unrated' && (word.rating_count && word.rating_count > 0)) return false;
      if (wordMediaFilter === 'audio' && !(word.has_audio || (word.assets ?? []).some((asset) => asset.has_audio))) return false;
      if (wordMediaFilter === 'video' && !(word.has_video || (word.assets ?? []).some((asset) => asset.has_video))) return false;
      if (wordMediaFilter === 'missing_audio' && (word.has_audio || (word.assets ?? []).some((asset) => asset.has_audio))) return false;
      const hasTokenProblem = (word.token_problem_count ?? 0) > 0;
      if (wordStatusFilter === 'problem' && !word.problem && !hasTokenProblem) return false;
      if (wordStatusFilter === 'ok' && (word.problem || hasTokenProblem)) return false;
      if (wordStatusFilter === 'generating' && !['queued', 'running'].includes(word.generation_status || '')) return false;
      if (wordStatusFilter === 'requested' && word.status !== 'requested') return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (wordSort === 'newest') return newestWordFirst(a, b);
      if (wordSort === 'plays') return (b.play_count || 0) - (a.play_count || 0) || highestRatedWordFirst(a, b);
      if (wordSort === 'usage') return (b.count || 0) - (a.count || 0) || highestRatedWordFirst(a, b);
      if (wordSort === 'source') return a.source.localeCompare(b.source, 'zh-Hant') || highestRatedWordFirst(a, b);
      return highestRatedWordFirst(a, b);
    });
  }, [safeWords, wordKindFilter, wordRatingFilter, wordMediaFilter, wordStatusFilter, wordSort]);
  const publicWaitSeconds = queueStatus?.rate_limit.next_available_at
    ? Math.max(0, queueStatus.rate_limit.next_available_at - nowSeconds)
    : 0;
  const publicCanSubmit = publicWaitSeconds <= 1;
  const visibleSegments = selectedJob?.id === segmentJobId ? segments : [];
  const selectedMedia = useMemo(() => new URLSearchParams(window.location.search).get('media') ?? '', []);
  const jobMediaSrc = (job: Job, kind: 'audio' | 'video' | 'zip' | 'taigi' | 'tailo' | 'segments') => (
    job.static_media?.[kind] || `/jobs/${job.id}/media/${kind}`
  );
  const jobDownloadSrc = (job: Job, kind: 'audio' | 'video' | 'zip' | 'taigi' | 'tailo' | 'segments') => (
    `/jobs/${job.id}/download/${kind}`
  );
  const wordAssetMediaSrc = (word: WordEntry, asset: WordAsset, kind: 'audio' | 'video') => (
    word.static_media?.assets?.[asset.id]?.[kind]
    || (asset.id === 'legacy' ? word.static_media?.[kind] : undefined)
    || `/words/${word.id}/assets/${asset.id}/media/${kind}`
  );
  const wordAssetDownloadSrc = (word: WordEntry, asset: WordAsset, kind: 'audio' | 'video') => (
    `/words/${word.id}/assets/${asset.id}/download/${kind}`
  );
  const pauseOtherMedia = (current?: HTMLMediaElement | null) => {
    const detachedAudio = detachedAudioRef.current;
    if (detachedAudio && detachedAudio !== current && !detachedAudio.paused) {
      detachedAudio.pause();
    }
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
      if (media !== current && !media.paused) {
        media.pause();
      }
    });
  };
  const primaryWordAsset = (word: WordEntry) => (
    (word.assets ?? []).find((asset) => asset.has_audio) ?? (word.assets ?? [])[0] ?? null
  );
  const playWordAudio = (word: WordEntry) => {
    const asset = primaryWordAsset(word);
    if (!asset?.has_audio) {
      message.info('這個詞語還沒有語音');
      return;
    }
    const url = wordAssetMediaSrc(word, asset, 'audio');
    const audio = new Audio(url);
    pauseOtherMedia(audio);
    detachedAudioRef.current = audio;
    audio.play().catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
  };
  const toggleWordDetails = (wordId: string) => {
    setExpandedWordIds((current) => ({ ...current, [wordId]: !current[wordId] }));
  };
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
  const segmentAudioDownloadSrc = (job: Job, segment: Segment | number) => {
    const segmentIndex = typeof segment === 'number' ? segment : segment.index;
    const version = typeof segment === 'number' ? undefined : segment.regenerated_at;
    return versionedUrl(`/jobs/${job.id}/segments/${segmentIndex}/audio`, version);
  };

  const loadAuth = async () => {
    const res = await axios.get<AuthStatus>('/auth/status');
    if (!res.data.authenticated) {
      setAuthSessionToken(null);
    }
    setAuth(res.data);
  };

  const loadInfo = async () => {
    const res = await axios.get<ApiInfo>('/api/info');
    setApiInfo(res.data);
  };

  const mergeById = <T extends { id: string }>(current: T[], next: T[]) => {
    const ids = new Set(next.map((item) => item.id));
    return [...next, ...current.filter((item) => !ids.has(item.id))];
  };

  const applyJobs = (nextJobs: Job[], append = false) => {
    const effectiveJobs = append ? mergeById(jobs, nextJobs) : nextJobs;
    setJobs(effectiveJobs);
    setSelectedJobId((current) => {
      if (effectiveJobs.length === 0) return null;
      if (current && effectiveJobs.some((job) => job.id === current)) return current;
      return effectiveJobs.find((job) => job.status === 'complete' && !!job.featured_at)?.id ?? effectiveJobs[0].id;
    });
  };

  const loadStaticJobs = async (append = false, query = jobSearch) => {
    const snapshot = await loadStaticSnapshot<{ jobs: Job[] }>('jobs/index.json');
    const cleaned = query.trim().toLowerCase();
    const sourceJobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
    const filtered = cleaned ? sourceJobs.filter((job) => jobMatchesSearch(job, cleaned)) : sourceJobs;
    const offset = append ? jobs.length : 0;
    const nextJobs = filtered.slice(offset, offset + DEFAULT_PAGE_SIZE);
    setReadOnlyMode(true);
    setJobsTotal(filtered.length);
    setJobsHasMore(offset + nextJobs.length < filtered.length);
    applyJobs(nextJobs, append);
  };

  const loadLiveJobs = async (append = false, query = jobSearch) => {
    const offset = append ? jobs.length : 0;
    const res = await axios.get<PaginatedJobsResponse>('/jobs', {
      params: {
        q: query.trim() || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset,
      },
    });
    const nextJobs = Array.isArray(res.data.jobs) ? res.data.jobs : [];
    setReadOnlyMode(false);
    setJobsTotal(Number.isFinite(res.data.total) ? res.data.total : nextJobs.length);
    setJobsHasMore(!!res.data.has_more);
    applyJobs(nextJobs, append);
  };

  const loadJobs = async (options: { append?: boolean; query?: string } = {}) => {
    const append = !!options.append;
    const query = options.query ?? jobSearch;
    setLoadingJobs(true);
    try {
      if (PREFER_STATIC_DATA && !signedIn) {
        await loadStaticJobs(append, query);
      } else {
        await loadLiveJobs(append, query);
      }
    } catch {
      if (PREFER_STATIC_DATA && !signedIn) {
        await loadLiveJobs(append, query);
      } else {
        await loadStaticJobs(append, query);
      }
    } finally {
      setJobsLoaded(true);
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

  const loadWords = async (query = wordQueryRef.current, append = false) => {
    wordQueryRef.current = query;
    const offset = append ? words.length : 0;
    setLoadingWords(true);
    try {
      if (PREFER_STATIC_DATA && !signedIn) {
        throw new Error('Prefer static lexicon snapshot.');
      }
      const res = await axios.get<PaginatedWordsResponse>('/words', {
        params: { q: query, limit: DEFAULT_PAGE_SIZE, offset },
      });
      const nextWords = Array.isArray(res.data.words) ? res.data.words : [];
      setReadOnlyMode(false);
      setWords((current) => (append ? mergeById(current, nextWords) : nextWords));
      setWordsTotal(Number.isFinite(res.data.total) ? res.data.total : nextWords.length);
      setWordsHasMore(!!res.data.has_more);
    } catch {
      const snapshot = await loadStaticSnapshot<{ words: WordEntry[]; total: number }>('lexicon/index.json');
      const cleaned = query.trim().toLowerCase();
      const filtered = cleaned
        ? (Array.isArray(snapshot.words) ? snapshot.words : []).filter((item) => (
          item.source.toLowerCase().includes(cleaned)
          || item.taigi.toLowerCase().includes(cleaned)
          || item.tailo.toLowerCase().includes(cleaned)
          || (item.category ?? '').toLowerCase().includes(cleaned)
          || (item.note ?? '').toLowerCase().includes(cleaned)
        ))
        : (Array.isArray(snapshot.words) ? snapshot.words : []);
      const nextWords = filtered.slice(offset, offset + DEFAULT_PAGE_SIZE);
      setReadOnlyMode(true);
      setWords((current) => (append ? mergeById(current, nextWords) : nextWords));
      setWordsTotal(filtered.length);
      setWordsHasMore(offset + nextWords.length < filtered.length);
    } finally {
      setLoadingWords(false);
    }
  };

  const loadStats = async () => {
    try {
      if (PREFER_STATIC_DATA && !signedIn) {
        throw new Error('Prefer static stats snapshot.');
      }
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
    if (PREFER_STATIC_DATA && !signedIn) return;
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

  const jumpToCreateJob = () => {
    if (activeTab !== 'work') {
      changeActiveTab('work');
    }
    window.setTimeout(() => {
      document.getElementById('create-job-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
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

  const changeDateTimeFormat = (nextFormat: DateTimeFormatPreference) => {
    setDateTimeFormat(nextFormat);
    try {
      window.localStorage.setItem('taigi_web_date_time_format', nextFormat);
    } catch {
      // Ignore storage failures; the current session still uses the selected format.
    }
  };

  const loadSegments = async (jobId: string) => {
    const staticSegmentsUrl = selectedJob?.id === jobId ? selectedJob.static_media?.segments : '';
    const res = PREFER_STATIC_DATA && !signedIn && staticSegmentsUrl
      ? await axios.get<{ segments: Segment[] }>(staticSegmentsUrl, { timeout: 10000 })
      : await axios.get<{ segments: Segment[] }>(`/jobs/${jobId}/segments`);
    const nextSegments = Array.isArray(res.data.segments) ? res.data.segments : [];
    const nextDrafts: Record<number, SegmentReviewPayload> = {};
    for (const segment of nextSegments) {
      nextDrafts[segment.index] = {
        rating: segment.my_rating ?? segment.rating ?? 0,
        note: segment.my_note ?? '',
        corrected_taigi_text: inlineText(segment.corrected_taigi_text ?? segment.taigi_text),
        corrected_tailo_text: inlineText(segment.corrected_tailo_text ?? segment.tailo_text),
        corrections: [
          ...(segment.source_tokens ?? [])
            .filter((token) => token.review_status)
            .map((token) => ({
              source_phrase: token.source,
              taigi_correction: token.taigi,
              tailo_correction: token.tailo,
              note: token.review_status === 'problem' ? '詞彙需要檢查' : '詞彙已確認沒問題',
              status: token.review_status,
            })),
          { source_phrase: '', taigi_correction: '', tailo_correction: '', note: '', status: '' },
        ],
      };
    }
    setSegments(nextSegments);
    setFeedbackDrafts(nextDrafts);
    setSelectedSegmentTokens({});
    setSegmentJobId(jobId);
  };

  useEffect(() => {
    const handleMediaPlay = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLMediaElement) {
        pauseOtherMedia(target);
      }
    };
    document.addEventListener('play', handleMediaPlay, true);
    return () => {
      document.removeEventListener('play', handleMediaPlay, true);
      detachedAudioRef.current?.pause();
      detachedAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!PREFER_STATIC_DATA && !window.sessionStorage.getItem('taigi_page_visit_recorded')) {
      window.sessionStorage.setItem('taigi_page_visit_recorded', '1');
      axios.post('/stats/action', {
        action: 'page_visit',
        target_type: 'page',
        target_id: window.location.pathname || '/',
        metadata: { referrer: document.referrer || '', path: window.location.pathname || '/' },
      }).catch(() => undefined);
    }
    const params = new URLSearchParams(window.location.search);
    const loginToken = params.get('token');
    if (loginToken) {
      axios.post<VerifyAuthResponse>('/auth/verify', { token: loginToken })
        .then(async (res) => {
          if (res.data.session_token) {
            setAuthSessionToken(res.data.session_token);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          await loadAuth();
          message.success('已登入');
        })
        .catch(() => {
          setAuthSessionToken(null);
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuth({ authenticated: false, is_admin: false, email: null, token_required: true, loopback_only: false });
          message.error('登入連結無效或已過期');
        });
    } else {
      if (PREFER_STATIC_DATA) {
        setAuth({ authenticated: false, is_admin: false, email: null, token_required: true, loopback_only: false });
      } else {
        loadAuth().catch(() => {
          setAuth({ authenticated: false, is_admin: false, email: null, token_required: true, loopback_only: false });
        });
      }
    }
    if (!PREFER_STATIC_DATA) {
      loadInfo().catch(() => undefined);
    }
    setLexiconQuery('');
    loadWords('').catch(() => undefined);
    loadStats().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (auth === null) return;
    loadJobs();
    if (!signedIn) {
      const clockTimer = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
      return () => window.clearInterval(clockTimer);
    }
    loadQueueStatus().catch(() => undefined);
    loadStats().catch(() => undefined);
    const jobsTimer = window.setInterval(loadJobs, LIVE_JOBS_POLL_INTERVAL_MS);
    const statusTimer = window.setInterval(() => {
      loadQueueStatus().catch(() => undefined);
      loadStats().catch(() => undefined);
      if (activeTab === 'lexicon') loadWords().catch(() => undefined);
    }, LIVE_STATUS_POLL_INTERVAL_MS);
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
      setSelectedSegmentTokens({});
      setSegmentJobId(null);
      return;
    }
    setSegments([]);
    setFeedbackDrafts({});
    setSelectedSegmentTokens({});
    setSegmentJobId(null);
    loadSegments(selectedJob.id).catch(() => {
      setSegments([]);
      setFeedbackDrafts({});
      setSelectedSegmentTokens({});
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
      const res = await axios.post<{ ok: boolean; delivered: boolean }>('/auth/magic-link', { email: loginEmail });
      if (!res.data.delivered) {
        setMagicLinkSent(false);
        message.error('登入連結沒有寄出，請檢查 SMTP 設定或服務日誌。');
        return;
      }
      setMagicLinkSent(true);
      message.success('登入連結已寄出');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '無法寄出登入連結');
    }
  };

  const logout = async () => {
      await axios.post('/auth/logout');
      setAuthSessionToken(null);
      setJobs([]);
      setJobsLoaded(false);
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
    autoVideoDefaultRef.current = true;
    syncingVideoDefaultRef.current = true;
    form.setFieldsValue({
      title: firstSentence(text),
      chinese_text: text,
      taigi_override: '',
      make_video: shouldDefaultMakeVideo(text),
    });
    window.setTimeout(() => {
      syncingVideoDefaultRef.current = false;
    }, 0);
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
      autoVideoDefaultRef.current = true;
      syncingVideoDefaultRef.current = true;
      form.setFieldsValue({
        title: res.data.title,
        chinese_text: res.data.chinese_text,
        taigi_override: '',
        make_video: shouldDefaultMakeVideo(res.data.chinese_text),
      });
      window.setTimeout(() => {
        syncingVideoDefaultRef.current = false;
      }, 0);
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

  const retryJob = async (job: Job) => {
    setRetryingJobs((current) => ({ ...current, [job.id]: true }));
    setJobError(null);
    try {
      const res = await axios.post<Job>(`/jobs/${job.id}/retry`, { mode: 'restart' }, { timeout: 60000 });
      setJobs((current) => current.map((item) => (item.id === res.data.id ? { ...item, ...res.data } : item)));
      setSelectedJobId(res.data.id);
      await loadJobs().catch(() => undefined);
      await loadQueueStatus().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success(`${jobDisplayTitle(job)} 已重新排入佇列`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '重新執行失敗。'
        : detail || '重新執行失敗。';
      setJobError(String(reason));
      message.error(String(reason));
    } finally {
      setRetryingJobs((current) => ({ ...current, [job.id]: false }));
    }
  };

  const regenerateFullJob = async (job: Job) => {
    setFullRegeneratingJobs((current) => ({ ...current, [job.id]: true }));
    setJobError(null);
    try {
      const res = await axios.post<Job>(`/jobs/${job.id}/regenerate-full`, {}, { timeout: 60000 });
      setJobs((current) => (current.some((item) => item.id === res.data.id) ? current : [res.data, ...current]));
      setSelectedJobId(res.data.id);
      setActiveTab('work');
      await loadJobs().catch(() => undefined);
      await loadQueueStatus().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success('已建立整篇重新生成工作');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '整篇重新生成失敗。'
        : detail || '整篇重新生成失敗。';
      setJobError(String(reason));
      message.error(String(reason));
    } finally {
      setFullRegeneratingJobs((current) => ({ ...current, [job.id]: false }));
    }
  };

  const runTermBatchRegeneration = async (dryRun: boolean) => {
    if (!termSearch.trim() || !termReplacement.trim()) {
      message.warning('請輸入搜尋詞和台語替換詞');
      return;
    }
    setRunningTermBatch(true);
    try {
      const res = await axios.post<TermBatchRegenerateResult>(
        '/admin/tools/term-regenerate',
        {
          search_term: termSearch.trim(),
          taigi_replacement: termReplacement.trim(),
          dry_run: dryRun,
          max_jobs: 200,
        },
        { timeout: 60000 },
      );
      setTermBatchResult(res.data);
      if (!dryRun && res.data.queued_jobs.length) {
        setJobs((current) => {
          const existing = new Set(current.map((job) => job.id));
          return [...res.data.queued_jobs.filter((job) => !existing.has(job.id)), ...current];
        });
        await loadJobs().catch(() => undefined);
        await loadQueueStatus().catch(() => undefined);
        await loadStats().catch(() => undefined);
      }
      message.success(dryRun
        ? `找到 ${res.data.match_count} 個相關分段，其中 ${res.data.regeneratable_count} 個可重生`
        : `已排入 ${res.data.queued_jobs.length} 筆批次重生工作`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '批次搜尋重生失敗。'
        : detail || '批次搜尋重生失敗。';
      message.error(String(reason));
    } finally {
      setRunningTermBatch(false);
    }
  };

  const selectedText = () => window.getSelection()?.toString().trim() ?? '';
  const synthesisSourceLabel = (source?: string) => (
    source === 'tailo' || source === 'corrected_tailo' ? '用台羅生成' : '用台語文字生成'
  );

  const updateFeedback = (segmentIndex: number, patch: Partial<SegmentReviewPayload>) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [segmentIndex]: {
        ...(current[segmentIndex] ?? {
          rating: 0,
          note: '',
          corrected_taigi_text: '',
          corrected_tailo_text: '',
          corrections: [{ source_phrase: '', taigi_correction: '', tailo_correction: '', note: '', status: '' }],
        }),
        ...patch,
      },
    }));
  };

  const updateCorrection = (
    segmentIndex: number,
    correctionIndex: number,
    field: 'source_phrase' | 'taigi_correction' | 'tailo_correction' | 'note' | 'status',
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
      corrections: [...draft.corrections, { source_phrase: '', taigi_correction: '', tailo_correction: '', note: '', status: '' }],
    });
  };

  const segmentTokenKey = (token: SegmentToken) => `${token.source}\u0000${token.taigi}\u0000${token.tailo}`;

  const correctionHasContent = (correction: SegmentReviewPayload['corrections'][number]) => (
    correction.source_phrase.trim()
    || correction.taigi_correction.trim()
    || correction.tailo_correction.trim()
    || correction.note.trim()
    || correction.status
  );

  const draftHasFeedback = (draft: SegmentReviewPayload) => (
    draft.rating > 0
    || draft.note.trim()
    || draft.corrected_taigi_text.trim()
    || draft.corrected_tailo_text.trim()
    || draft.corrections.some(correctionHasContent)
  );

  const segmentTokenStatus = (segment: Segment, token: SegmentToken) => {
    const draft = feedbackDrafts[segment.index];
    const correction = draft?.corrections.find((item) => item.source_phrase === token.source && item.status);
    return correction?.status || token.review_status || '';
  };

  const segmentSelectedTokens = (segment: Segment) => {
    const selected = new Set(selectedSegmentTokens[segment.index] ?? []);
    const seen = new Set<string>();
    return (segment.source_tokens ?? []).filter((token) => {
      const key = segmentTokenKey(token);
      if (!selected.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const toggleSegmentToken = (segment: Segment, token: SegmentToken) => {
    const key = segmentTokenKey(token);
    setSelectedSegmentTokens((current) => {
      const selected = new Set(current[segment.index] ?? []);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      return { ...current, [segment.index]: Array.from(selected) };
    });
  };

  const clearSegmentTokenSelection = (segmentIndex: number) => {
    setSelectedSegmentTokens((current) => ({ ...current, [segmentIndex]: [] }));
  };

  const wordTokenStatus = (token: SegmentToken) => token.review_status || '';

  const wordSelectedTokens = (word: WordEntry) => {
    const selected = new Set(selectedWordTokens[word.id] ?? []);
    const seen = new Set<string>();
    return (word.source_tokens ?? []).filter((token) => {
      const key = segmentTokenKey(token);
      if (!selected.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const toggleWordToken = (word: WordEntry, token: SegmentToken) => {
    const key = segmentTokenKey(token);
    setSelectedWordTokens((current) => {
      const selected = new Set(current[word.id] ?? []);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      return { ...current, [word.id]: Array.from(selected) };
    });
  };

  const clearWordTokenSelection = (wordId: string) => {
    setSelectedWordTokens((current) => ({ ...current, [wordId]: [] }));
  };

  const markWordTokens = async (word: WordEntry, status: 'problem' | 'ok') => {
    const tokens = wordSelectedTokens(word);
    if (tokens.length === 0) {
      message.warning('請先選取要標示的詞彙');
      return;
    }
    try {
      await axios.post(`/words/${word.id}/token-reviews`, {
        tokens: tokens.map((token) => ({ source: token.source, status })),
      });
      await loadWords(wordQueryRef.current);
      await loadStats().catch(() => undefined);
      clearWordTokenSelection(word.id);
      message.success(`已把 ${tokens.length} 個詞標示為${status === 'problem' ? '有問題' : '沒問題'}`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法儲存斷詞標示');
    }
  };

  const markSegmentTokens = (segment: Segment, tokens: SegmentToken[], status: 'problem' | 'ok') => {
    const draft = feedbackDrafts[segment.index];
    if (!draft) return;
    if (tokens.length === 0) {
      message.warning('請先選取要標示的詞彙');
      return;
    }
    const corrections = draft.corrections.filter(correctionHasContent);
    for (const token of tokens) {
      const existingIndex = corrections.findIndex((correction) => correction.source_phrase === token.source);
      const note = status === 'problem' ? '詞彙需要檢查' : '詞彙已確認沒問題';
      if (existingIndex >= 0) {
        corrections[existingIndex] = {
          ...corrections[existingIndex],
          taigi_correction: token.taigi || corrections[existingIndex].taigi_correction,
          tailo_correction: token.tailo || corrections[existingIndex].tailo_correction,
          note: corrections[existingIndex].note || note,
          status,
        };
      } else {
        corrections.push({
          source_phrase: token.source,
          taigi_correction: token.taigi || '',
          tailo_correction: token.tailo || '',
          note,
          status,
        });
      }
    }
    updateFeedback(segment.index, { corrections });
    message.success(`已把 ${tokens.length} 個詞標示為${status === 'problem' ? '有問題' : '沒問題'}`);
  };

  const openTokenInLexicon = async (token: SegmentToken) => {
    setLexiconQuery(token.source);
    changeActiveTab('lexicon');
    await loadWords(token.source).catch(() => undefined);
  };

  const createTokenWord = async (token: SegmentToken): Promise<WordEntry | null> => {
    try {
      const res = await axios.post<{ saved: boolean; word: WordEntry }>('/words/candidates', {
        source: token.source,
        taigi: token.taigi,
        tailo: token.tailo,
        note: '從分段斷詞標示加入詞庫',
      });
      await loadWords(token.source);
      await loadStats().catch(() => undefined);
      message.success(`已把「${token.source}」加入詞庫`);
      return res.data.word;
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法加入詞庫');
      return null;
    }
  };

  const reportTokenWordIssue = async (token: SegmentToken) => {
    const wordId = token.word_id || (await createTokenWord(token))?.id;
    if (!wordId) return;
    try {
      await axios.post(`/words/${wordId}/issue`, { reason: `分段修正標示「${token.source}」有問題，需要檢查或重新產生。` });
      await loadWords(wordQueryRef.current).catch(() => undefined);
      message.success(`已標記「${token.source}」為問題詞彙`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法標記詞彙問題');
    }
  };

  const generateTokenWordAudio = async (token: SegmentToken) => {
    const wordId = token.word_id || (await createTokenWord(token))?.id;
    if (!wordId) return;
    try {
      await axios.post(`/words/${wordId}/generate`, { synthesis_source: 'taigi' }, { timeout: 30000 });
      await loadWords(wordQueryRef.current).catch(() => undefined);
      await loadJobs().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success(`已把「${token.source}」的單詞語音排入佇列`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法產生單詞語音');
    }
  };

  const markSelectedSegmentTokens = (segment: Segment, status: 'problem' | 'ok') => {
    markSegmentTokens(segment, segmentSelectedTokens(segment), status);
  };

  const reportSelectedSegmentTokens = async (segment: Segment) => {
    const tokens = segmentSelectedTokens(segment);
    if (tokens.length === 0) {
      message.warning('請先選取要標示的詞彙');
      return;
    }
    for (const token of tokens) {
      await reportTokenWordIssue(token);
    }
    if (segmentJobId) {
      await loadSegments(segmentJobId).catch(() => undefined);
    }
  };

  const generateSelectedTokenAudio = async (segment: Segment) => {
    const tokens = segmentSelectedTokens(segment);
    if (tokens.length === 0) {
      message.warning('請先選取要產生語音的詞彙');
      return;
    }
    for (const token of tokens) {
      await generateTokenWordAudio(token);
    }
    if (segmentJobId) {
      await loadSegments(segmentJobId).catch(() => undefined);
    }
  };

  const submitFeedback = async (segment: Segment) => {
    const draft = feedbackDrafts[segment.index];
    if (!selectedJob || !draft || !draftHasFeedback(draft)) {
      message.warning('請先評分、修正文字，或標示詞彙狀態');
      return;
    }
    try {
      await axios.post(`/jobs/${selectedJob.id}/segments/${segment.index}/feedback`, {
        ...draft,
        corrections: draft.corrections.filter(correctionHasContent),
      });
      await loadSegments(selectedJob.id);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success('已儲存這段回饋與詞彙標示');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '儲存失敗');
    }
  };

  const saveSegmentRating = async (segment: Segment, rating: number) => {
    updateFeedback(segment.index, { rating });
    if (!selectedJob || rating < 1) return;
    const draft = feedbackDrafts[segment.index];
    const body = segmentFeedbackBody({
      rating,
      note: draft?.note ?? '',
      corrected_taigi_text: draft?.corrected_taigi_text ?? inlineText(segment.corrected_taigi_text ?? segment.taigi_text),
      corrected_tailo_text: draft?.corrected_tailo_text ?? inlineText(segment.corrected_tailo_text ?? segment.tailo_text),
      corrections: draft?.corrections ?? [{ source_phrase: '', taigi_correction: '', tailo_correction: '', note: '', status: '' }],
    });
    try {
      const res = await axios.post<{ saved: boolean; stats: { my_rating?: number | null; average_rating?: number | null; rating_count?: number } }>(
        `/jobs/${selectedJob.id}/segments/${segment.index}/feedback`,
        body,
      );
      setSegments((current) => current.map((item) => (
        item.index === segment.index
          ? {
              ...item,
              rating,
              my_rating: res.data.stats.my_rating ?? rating,
              average_rating: res.data.stats.average_rating ?? item.average_rating,
              rating_count: res.data.stats.rating_count ?? item.rating_count,
              feedback_count: res.data.stats.rating_count ?? item.feedback_count,
            }
          : item
      )));
      message.success('已儲存這段正確度評分');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '正確度評分儲存失敗');
    }
  };

  const segmentFeedbackBody = (draft: SegmentReviewPayload) => ({
    ...draft,
    corrections: draft.corrections.filter(correctionHasContent),
  });

  const regenerateSegment = async (segment: Segment) => {
    const draft = feedbackDrafts[segment.index];
    if (!selectedJob || !draft) {
      message.warning('分段資料尚未載入完成');
      return;
    }
    setRegeneratingSegments((current) => ({ ...current, [segment.index]: true }));
    setJobError(null);
    const sourceJobId = selectedJob.id;
    try {
      const res = await axios.post<{ queued: boolean; job: Job; source_job: Job; segment_index: number }>(
        `/jobs/${sourceJobId}/segments/${segment.index}/regenerate`,
        {
          ...segmentFeedbackBody(draft),
          synthesis_source: segmentSynthesisSources[segment.index] ?? 'taigi',
        },
        { timeout: 60000 },
      );
      setJobs((current) => {
        const patched = current.map((job) => (job.id === res.data.source_job.id ? { ...job, ...res.data.source_job } : job));
        return patched.some((job) => job.id === res.data.job.id) ? patched : [res.data.job, ...patched];
      });
      setSelectedJobId(res.data.job.id);
      await loadJobs().catch(() => undefined);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success(`Segment ${segment.index} 已加入重生佇列，可在工作列表查看進度`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '重新產生分段失敗。'
        : detail || '重新產生分段失敗。';
      setJobError(String(reason));
      message.error(String(reason));
    } finally {
      setRegeneratingSegments((current) => ({ ...current, [segment.index]: false }));
    }
  };

  const regenerateReviewedSegments = async () => {
    if (!selectedJob) return;
    setRegeneratingReviewed(true);
    setJobError(null);
    const sourceJobId = selectedJob.id;
    try {
      const res = await axios.post<{ queued: boolean; segment_count: number; job: Job; source_job: Job }>(
        `/jobs/${sourceJobId}/segments/regenerate-reviewed`,
        {},
        { timeout: 60000 },
      );
      setJobs((current) => {
        const patched = current.map((job) => (job.id === res.data.source_job.id ? { ...job, ...res.data.source_job } : job));
        return patched.some((job) => job.id === res.data.job.id) ? patched : [res.data.job, ...patched];
      });
      setSelectedJobId(res.data.job.id);
      await loadJobs().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success(`已把 ${res.data.segment_count} 個有回饋的分段加入重生佇列`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '重新產生已回饋分段失敗。'
        : detail || '重新產生已回饋分段失敗。';
      setJobError(String(reason));
      message.error(String(reason));
    } finally {
      setRegeneratingReviewed(false);
    }
  };

  const queueAudioReview = async (generateMms = false) => {
    if (!selectedJob) return;
    setReviewingAudio(true);
    setJobError(null);
    try {
      const res = await axios.post<{ queued: boolean; job: Job; source_job: Job }>(
        `/jobs/${selectedJob.id}/audio-review`,
        { run_asr: true, generate_mms: generateMms },
        { timeout: 60000 },
      );
      setJobs((current) => {
        const patched = current.map((job) => (job.id === res.data.source_job.id ? { ...job, ...res.data.source_job } : job));
        return patched.some((job) => job.id === res.data.job.id) ? patched : [res.data.job, ...patched];
      });
      setSelectedJobId(res.data.job.id);
      await loadJobs().catch(() => undefined);
      await loadQueueStatus().catch(() => undefined);
      await loadStats().catch(() => undefined);
      message.success(generateMms ? '已排入音訊校對與 MMS 對照工作' : '已排入音訊校對工作');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '音訊校對排程失敗。'
        : detail || '音訊校對排程失敗。';
      setJobError(String(reason));
      message.error(String(reason));
    } finally {
      setReviewingAudio(false);
    }
  };

  const regenerateFromCorrections = async () => {
    if (!selectedJob) return;
    setRegenerating(true);
    setJobError(null);
    try {
      if (selectedJob.kind === 'word_asset') {
        const wordId = typeof selectedJob.metadata?.word_id === 'string' ? selectedJob.metadata.word_id : '';
        if (!wordId) {
          throw new Error('這筆詞語語音工作缺少詞語資訊，無法重新產生。');
        }
        const res = await axios.post<{ job?: Job }>(`/words/${wordId}/generate`, { synthesis_source: 'taigi' }, { timeout: 30000 });
        if (res.data.job?.id) {
          setSelectedJobId(res.data.job.id);
        }
        message.success('已排入詞語語音重新產生佇列');
      } else {
        const res = await axios.post<Job>(`/jobs/${selectedJob.id}/regenerate`, {}, { timeout: 60000 });
        setSelectedJobId(res.data.id);
        message.success('已用修正後資料建立新的生成工作');
      }
      await loadJobs();
      await loadQueueStatus().catch(() => undefined);
      await loadWords().catch(() => undefined);
      await loadStats().catch(() => undefined);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const reason = detail && typeof detail === 'object'
        ? detail.message || '後端拒絕重新生成。'
        : detail || (error instanceof Error ? error.message : '重新生成失敗。');
      const fullReason = `重新生成失敗：${reason}${status ? `（HTTP ${status}）` : ''}`;
      setJobError(fullReason);
      message.error(fullReason);
    } finally {
      setRegenerating(false);
    }
  };

  const reportWordIssue = async (word: WordEntry, issueType: ProblemType = '') => {
    try {
      const reason = issueType === 'chinese_voice_not_taigi'
        ? '這個詞語音訊聽起來是中文語音，沒有成功轉成台語，需要重新產生。'
        : '使用者回報詞語素材有問題，需要重新產生。';
      await axios.post(`/words/${word.id}/issue`, { reason, issue_type: issueType });
      await loadWords();
      message.success(issueType === 'chinese_voice_not_taigi' ? '已標示為中文語音未轉台語' : '已標記這個詞語素材需要重新產生');
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

  const markJobIssue = async (job: Job, status: 'problem' | 'ok', issueType: ProblemType = '') => {
    try {
      const reason = status === 'problem'
        ? issueType === 'chinese_voice_not_taigi'
          ? '使用者標示這個工作成果是中文語音，沒有成功轉成台語，需要檢查。'
          : '使用者標示這個工作成果有問題，需要檢查。'
        : '使用者標示這個工作成果沒有問題。';
      await axios.post(`/jobs/${job.id}/issue`, { status, reason, issue_type: issueType });
      await loadJobs();
      await loadStats().catch(() => undefined);
      message.success(status === 'problem' ? (issueType === 'chinese_voice_not_taigi' ? '已標示為中文語音未轉台語' : '已標示這個工作成果有問題') : '已標示這個工作成果沒問題');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || detail || '無法更新工作成果狀態');
    }
  };

  const setJobFeatured = async (job: Job, featured: boolean) => {
    try {
      await axios.post(`/jobs/${job.id}/featured`, {
        featured,
        note: featured ? '首頁示範影片' : '',
      });
      await loadJobs();
      message.success(featured ? '已加入首頁精選' : '已取消首頁精選');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || detail || '無法更新首頁精選');
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

  const generateWordAudio = async (word: WordEntry, synthesisSource?: SynthesisSource) => {
    const selectedSource = synthesisSource ?? wordSynthesisSources[word.id] ?? 'taigi';
    try {
      await axios.post(`/words/${word.id}/generate`, { synthesis_source: selectedSource, make_video: false }, { timeout: 30000 });
      await loadWords();
      await loadJobs();
      await loadStats().catch(() => undefined);
      message.success(`已排入詞語語音重新產生佇列：${synthesisSourceLabel(selectedSource)}`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法產生詞語語音');
    }
  };

  const generateWordVideo = async (word: WordEntry, asset: WordAsset) => {
    const key = `${word.id}:${asset.id}`;
    setGeneratingWordVideos((current) => ({ ...current, [key]: true }));
    try {
      await axios.post(`/words/${word.id}/assets/${asset.id}/video`, {}, { timeout: 120000 });
      await loadWords();
      await loadStats().catch(() => undefined);
      message.success('已產生這筆詞語影片');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法產生詞語影片');
    } finally {
      setGeneratingWordVideos((current) => ({ ...current, [key]: false }));
    }
  };

  const loadItaigiReference = async (word: WordEntry) => {
    setLoadingItaigiReferences((current) => ({ ...current, [word.id]: true }));
    try {
      const res = await axios.get<ItaigiReferenceResult>(`/words/${word.id}/itaigi-reference`, { timeout: 30000 });
      setItaigiReferences((current) => ({ ...current, [word.id]: res.data }));
      if (res.data.candidates.length === 0) {
        message.info('iTaigi 目前沒有查到可參考的語料。');
      }
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法查詢 iTaigi 參考資料');
    } finally {
      setLoadingItaigiReferences((current) => ({ ...current, [word.id]: false }));
    }
  };

  const applyItaigiReference = async (word: WordEntry, candidate: ItaigiReferenceCandidate) => {
    const key = `${word.id}:${candidate.id || candidate.tailo}`;
    setApplyingItaigiReferences((current) => ({ ...current, [key]: true }));
    try {
      const res = await axios.post<{ job?: Job }>(
        `/words/${word.id}/itaigi-reference/apply`,
        {
          taigi: candidate.taigi,
          tailo: candidate.tailo,
          audio_url: candidate.audio_url ?? '',
          source_url: candidate.source_url ?? itaigiSearchUrl(word.source),
          good: candidate.good ?? 0,
          bad: candidate.bad ?? 0,
        },
        { timeout: 30000 },
      );
      if (res.data.job?.id) {
        setSelectedJobId(res.data.job.id);
      }
      await loadWords();
      await loadJobs();
      await loadStats().catch(() => undefined);
      message.success('已套用 iTaigi 參考資料並排入重新產生');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error((detail && typeof detail === 'object' ? detail.message : detail) || '無法套用 iTaigi 參考資料');
    } finally {
      setApplyingItaigiReferences((current) => ({ ...current, [key]: false }));
    }
  };

  const openWordAssetVideo = (word: WordEntry, asset: WordAsset) => {
    const url = wordAssetMediaSrc(word, asset, 'video');
    window.open(url, '_blank', 'noopener,noreferrer');
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
    try {
      const res = await axios.post('/words/requests', {
        source,
        note: sourceRequestNote.trim() || '使用者在 Sources 頁面申請增加多語系資料詞條。',
      });
      const wordId = res.data.word?.id;
      if (wordId && auth?.email) {
        await axios.post(`/words/${wordId}/translations`, {
          languages: UI_LANGUAGES.map((item) => item.value),
          overwrite: false,
        });
      }
      setSourceRequestWord('');
      setSourceRequestNote('');
      await loadWords();
      await loadStats().catch(() => undefined);
      message.success(auth?.email ? '已送出詞條與多語系語料申請' : '已匿名送出詞條申請');
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
          colorPrimary: '#1b63f0',
          borderRadius: 12,
          colorText: '#092764',
          colorTextSecondary: '#66728a',
          colorBorder: '#d9e7f6',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f4fbff',
        },
        components: {
          Layout: {
            headerBg: 'rgba(255, 255, 255, 0.78)',
            headerColor: '#092764',
          },
          Card: {
            boxShadowTertiary: '0 10px 26px rgba(7,39,96,0.08)',
          },
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="app-header">
          <div className="top-brand">
            <AudioOutlined className="top-brand-icon" />
            <div>
              <Title level={4} className="top-brand-title">{t('siteName')}</Title>
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
              { key: 'about', label: t('about') },
              { key: 'preferences', label: t('preferences') },
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
            {signedIn ? (
              <>
                <Tag color={isAdmin ? 'success' : 'blue'}>{isAdmin ? t('admin') : t('user')}</Tag>
                {auth?.email && <Tag>{auth.email}</Tag>}
                <Button size="small" icon={<ReloadOutlined />} onClick={() => loadJobs()} loading={loadingJobs}>{t('refresh')}</Button>
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
              activeTab === 'lexicon' ? 'show-lexicon' : activeTab === 'jobs' ? 'show-jobs' : activeTab === 'stats' ? 'show-stats' : activeTab === 'sources' ? 'show-sources' : activeTab === 'about' ? 'show-about' : activeTab === 'preferences' ? 'show-preferences' : 'show-work'
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
                <Card id="create-job-card" className="create-job-card">
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
                      type={publicCanSubmit ? 'info' : 'warning'}
                      showIcon
                      className="queue-status"
                      message={queueStatus.private_client
                        ? '內網使用者目前可以優先送出'
                        : !publicCanSubmit
                        ? (
                          <>
                            未登入使用者還要等待 <span className="stable-number">{formatStableWait(publicWaitSeconds)}</span> 才能再次生成
                          </>
                        )
                        : '未登入使用者目前可以送出一段文章'}
                      description={
                        <Space direction="vertical" size={2}>
                          <Text>
                            目前 <span className="stable-number">{queueStatus.queue.running_count}</span> 個工作執行中，<span className="stable-number">{queueStatus.queue.queued_count}</span> 個工作正在排隊。
                          </Text>
                          <Text type="secondary">
                            {queueStatus.private_client
                              ? <>內網送出的工作會優先處理；現在送出會排在第 <span className="stable-number">{queueStatus.queue.next_position}</span> 個。</>
                              : <>現在送出會排在第 <span className="stable-number">{queueStatus.queue.next_position}</span> 個；未登入使用者每次最多 <span className="stable-number">{queueStatus.rate_limit.max_chars ?? 1200}</span> 字，送出後需等待 <span className="stable-number">{formatWait(queueStatus.rate_limit.limit_seconds)}</span> 才能再次生成。</>}
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
                      make_video: shouldDefaultMakeVideo(defaultChineseText),
                      copy_to_onedrive: apiInfo?.default_copy_to_onedrive ?? true,
                    }}
                    onValuesChange={(changedValues) => {
                      if (Object.prototype.hasOwnProperty.call(changedValues, 'make_video')) {
                        if (syncingVideoDefaultRef.current) {
                          syncingVideoDefaultRef.current = false;
                        } else {
                          autoVideoDefaultRef.current = false;
                        }
                      }
                      if (Object.prototype.hasOwnProperty.call(changedValues, 'chinese_text') && autoVideoDefaultRef.current) {
                        syncingVideoDefaultRef.current = true;
                        form.setFieldValue('make_video', shouldDefaultMakeVideo(String(changedValues.chinese_text ?? '')));
                        window.setTimeout(() => {
                          syncingVideoDefaultRef.current = false;
                        }, 0);
                      }
                    }}
                    onFinish={startJob}
                  >
                    <Form.Item label="標題" name="title" rules={[{ required: true }]}>
                      <Input prefix={<FileTextOutlined />} />
                    </Form.Item>
                    <Form.Item label="中文稿" name="chinese_text" rules={[{ required: true, message: '請輸入中文稿' }]}>
                      <TextArea autoSize={{ minRows: 4, maxRows: 28 }} className="textarea-mono long-textarea" />
                    </Form.Item>
                    <Form.Item label="台語稿覆寫（可留空，系統會先自動翻成草稿）" name="taigi_override">
                      <TextArea autoSize={{ minRows: 3, maxRows: 28 }} className="textarea-mono long-textarea" placeholder="人工校稿後的台語稿可貼佇遮" />
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
                                  <Checkbox>輸出 MP4 影片（長篇文章預設開啟，短詞句預設只輸出 WAV）</Checkbox>
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
                  <Flex align="center" justify="space-between" gap={12} wrap className="card-title">
                    <Space size={8} wrap>
                      <Title level={3} style={{ margin: 0 }}>最新成果</Title>
                      {selectedJob && <Tag color={statusColor[selectedJob.status]}>{selectedJob.status}</Tag>}
                      {selectedJob?.featured_at && <Tag color="gold">首頁精選</Tag>}
                      {selectedJob?.problem && <Tag color="error">成果有問題</Tag>}
                      {selectedJob?.problem && <ProblemTypeTag problemType={selectedJob.problem_type} />}
                    </Space>
                    <Space size={8} wrap>
                      {isAdmin && selectedJob?.status === 'complete' && (
                        <Button onClick={() => setJobFeatured(selectedJob, !selectedJob.featured_at)}>
                          {selectedJob.featured_at ? '取消精選' : '設為首頁精選'}
                        </Button>
                      )}
                      <Button type="primary" icon={<SendOutlined />} onClick={jumpToCreateJob}>
                        建立新工作
                      </Button>
                    </Space>
                  </Flex>
                  {!selectedJob ? (
                    <Alert
                      type="info"
                      showIcon
                      message="尚未建立工作"
                      description={(
                        <Button type="primary" icon={<SendOutlined />} onClick={jumpToCreateJob}>
                          立即建立第一個台語語音影片
                        </Button>
                      )}
                    />
                  ) : (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      <Alert
                        type="info"
                        showIcon
                        className="create-job-shortcut"
                        message="想產生新的台語語音影片？"
                        description={(
                          <Flex align="center" justify="space-between" gap={12} wrap>
                            <Text type="secondary">
                              先在這裡播放、評分或分享最新成果；要產生新稿時可直接跳到下方建立表單。
                            </Text>
                            <Button type="primary" icon={<SendOutlined />} onClick={jumpToCreateJob}>
                              建立新工作
                            </Button>
                          </Flex>
                        )}
                      />
                      <div>
                        <Text strong>{jobDisplayTitle(selectedJob)}</Text>
                        <br />
                        <Text type="secondary">
                          {formatJobMeta(selectedJob)}
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
                                    {formatRatingText(selectedJob.rating_average, selectedJob.rating_count)}
                                  </Text>
                                </>
                              )}
                            </div>
                            <Space size={8} wrap>
                              <Rate value={selectedJob.my_rating ?? 0} onChange={(rating) => rateJob(selectedJob, rating)} />
                              <Button size="small" danger={selectedJob.problem} onClick={() => markJobIssue(selectedJob, selectedJob.problem ? 'ok' : 'problem')}>
                                {selectedJob.problem ? '標示沒問題' : '標示成果有問題'}
                              </Button>
                              {selectedJob.problem_type !== 'chinese_voice_not_taigi' && (
                                <Button size="small" danger onClick={() => markJobIssue(selectedJob, 'problem', 'chinese_voice_not_taigi')}>
                                  中文語音未轉台語
                                </Button>
                              )}
                            </Space>
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
                                preload="none"
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
                            <Button type="primary" icon={<DownloadOutlined />} href={jobDownloadSrc(selectedJob, 'zip')}>
                              全部下載
                            </Button>
                            <Button icon={<AudioOutlined />} href={jobDownloadSrc(selectedJob, 'audio')}>音訊</Button>
                            {selectedJob.video_path && (
                              <Button icon={<VideoCameraOutlined />} href={jobDownloadSrc(selectedJob, 'video')}>影片</Button>
                            )}
                            <Button href={jobDownloadSrc(selectedJob, 'taigi')}>台語稿</Button>
                            <Button href={jobDownloadSrc(selectedJob, 'tailo')}>台羅</Button>
                            <Button href={jobDownloadSrc(selectedJob, 'segments')}>分段 JSON</Button>
                            <Button onClick={regenerateReviewedSegments} loading={regeneratingReviewed}>
                              重生已回饋段落
                            </Button>
                            {selectedJob.kind !== 'word_asset' && selectedJob.kind !== 'audio_review' && (
                              <>
                                <Button onClick={() => queueAudioReview(false)} loading={reviewingAudio}>
                                  音訊校對
                                </Button>
                                <Button onClick={() => queueAudioReview(true)} loading={reviewingAudio}>
                                  校對 + MMS 對照
                                </Button>
                              </>
                            )}
                            <Button onClick={regenerateFromCorrections} loading={regenerating}>
                              {selectedJob.kind === 'word_asset' ? '產生新的詞語語音版本' : '用修正稿重新生成'}
                            </Button>
                            {isAdmin && (
                              <>
                                {selectedJob.kind === 'script' && (
                                  <Button
                                    icon={<ReloadOutlined />}
                                    loading={!!fullRegeneratingJobs[selectedJob.id]}
                                    onClick={() => regenerateFullJob(selectedJob)}
                                  >
                                    整篇重新生成
                                  </Button>
                                )}
                                <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                                  刪除
                                </Button>
                              </>
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
                                const selectedTokenCount = segmentSelectedTokens(segment).length;
                                return (
                                  <div key={segment.index} className="segment-card">
                                    <Flex align="center" justify="space-between" gap={12} wrap>
                                      <Space>
                                        <Tag color="blue">Segment {segment.index}</Tag>
                                        {segment.duration && <Text type="secondary">{segment.duration.toFixed(2)}s</Text>}
                                        {segment.last_synthesis_source && (
                                          <Tag color={segment.last_synthesis_source.includes('tailo') ? 'cyan' : 'default'}>
                                            {synthesisSourceLabel(segment.last_synthesis_source)}
                                          </Tag>
                                        )}
                                        {!!segment.rating_count && (
                                          <Tag color="success">
                                            {formatRatingText(segment.average_rating, segment.rating_count)}
                                          </Tag>
                                        )}
                                        {!!segment.my_rating && <Tag color="gold">我的評分 {segment.my_rating}</Tag>}
                                      </Space>
                                      <Button href={segmentAudioDownloadSrc(selectedJob, segment)} icon={<DownloadOutlined />}>
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
                                    {segment.audio_review && (
                                      <div className="audio-review-panel">
                                        <Flex align="center" justify="space-between" gap={8} wrap>
                                          <Space size={8} wrap>
                                            <Text strong>音訊校對</Text>
                                            {segment.audio_review.comparison?.similarity != null && (
                                              <Tag color={segment.audio_review.comparison.similarity >= 0.8 ? 'success' : segment.audio_review.comparison.similarity >= 0.65 ? 'warning' : 'error'}>
                                                相似度 {(segment.audio_review.comparison.similarity * 100).toFixed(1)}%
                                              </Tag>
                                            )}
                                            {segment.audio_review.comparison?.cer != null && <Tag>CER {(segment.audio_review.comparison.cer * 100).toFixed(1)}%</Tag>}
                                            {(segment.audio_review.issues ?? []).map((issue) => <Tag color="error" key={issue}>{issue}</Tag>)}
                                          </Space>
                                          <Tag color={segment.audio_review.asr_status?.available ? 'processing' : 'default'}>
                                            {segment.audio_review.asr_status?.available ? 'Breeze ASR' : 'ASR 未執行'}
                                          </Tag>
                                        </Flex>
                                        {segment.audio_review.asr_transcript ? (
                                          <Text type="secondary">ASR 轉寫：{segment.audio_review.asr_transcript}</Text>
                                        ) : (
                                          <Text type="secondary">{segment.audio_review.asr_status?.reason || '尚未有 ASR 轉寫結果。'}</Text>
                                        )}
                                        {segment.audio_review.mms_status?.audio_file && (
                                          <Text type="secondary">MMS 對照音檔：{segment.audio_review.mms_status.audio_file}</Text>
                                        )}
                                      </div>
                                    )}
                                    <div className="segment-text-grid">
                                      <div>
                                        <Text strong>原本中文</Text>
                                        <Input.TextArea value={segment.source_text} autoSize readOnly className="textarea-mono compact-textarea" />
                                      </div>
                                      {(segment.source_tokens ?? []).length > 0 && (
                                        <div className="segment-token-panel">
                                          <Flex align="center" justify="space-between" gap={8} wrap>
                                            <Space size={8} wrap>
                                              <Text strong>斷詞</Text>
                                              <Tag>{segment.source_tokens?.length ?? 0} 詞</Tag>
                                              {selectedTokenCount > 0 && <Tag color="processing">已選 {selectedTokenCount}</Tag>}
                                            </Space>
                                            <Space size={6} wrap>
                                              <Button size="small" danger onClick={() => markSelectedSegmentTokens(segment, 'problem')}>
                                                標示有問題
                                              </Button>
                                              <Button size="small" onClick={() => markSelectedSegmentTokens(segment, 'ok')}>
                                                標示沒問題
                                              </Button>
                                              <Button size="small" type="primary" onClick={() => submitFeedback(segment)}>
                                                批次儲存紀錄
                                              </Button>
                                              <Button size="small" onClick={() => reportSelectedSegmentTokens(segment)}>
                                                標記詞庫問題
                                              </Button>
                                              <Button size="small" icon={<AudioOutlined />} onClick={() => generateSelectedTokenAudio(segment)}>
                                                產生單詞語音
                                              </Button>
                                              <Button size="small" disabled={selectedTokenCount === 0} onClick={() => clearSegmentTokenSelection(segment.index)}>
                                                清除選取
                                              </Button>
                                            </Space>
                                          </Flex>
                                          <div className="segment-token-list">
                                            {(segment.source_tokens ?? []).map((token, tokenIndex) => (
                                              <button
                                                type="button"
                                                key={`${segment.index}-${token.source}-${tokenIndex}`}
                                                className={[
                                                  'segment-token',
                                                  token.problem ? 'has-problem' : '',
                                                  segmentTokenStatus(segment, token) === 'problem' ? 'is-reviewed-problem' : '',
                                                  segmentTokenStatus(segment, token) === 'ok' ? 'is-reviewed-ok' : '',
                                                  selectedSegmentTokens[segment.index]?.includes(segmentTokenKey(token)) ? 'is-selected' : '',
                                                ].filter(Boolean).join(' ')}
                                                onClick={() => toggleSegmentToken(segment, token)}
                                              >
                                                <span>{token.source}</span>
                                                {segmentTokenStatus(segment, token) === 'problem' && <small>有問題</small>}
                                                {segmentTokenStatus(segment, token) === 'ok' && <small>沒問題</small>}
                                                {!segmentTokenStatus(segment, token) && token.exists && <small>{token.problem ? '問題' : token.has_audio ? '有音檔' : '詞庫'}</small>}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
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
                                            onChange={(rating) => saveSegmentRating(segment, rating)}
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
                                            <Select
                                              value={correction.status || ''}
                                              onChange={(value) => updateCorrection(segment.index, correctionIndex, 'status', value)}
                                              options={[
                                                { value: '', label: '未標示' },
                                                { value: 'problem', label: '有問題' },
                                                { value: 'ok', label: '沒問題' },
                                              ]}
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
                                          <Select<SynthesisSource>
                                            value={segmentSynthesisSources[segment.index] ?? 'taigi'}
                                            onChange={(value) => setSegmentSynthesisSources((current) => ({ ...current, [segment.index]: value }))}
                                            options={[
                                              { value: 'taigi', label: '用台語文字生成' },
                                              { value: 'tailo', label: '用台羅生成' },
                                            ]}
                                          />
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
                      {selectedJob.status === 'failed' && (
                        <Space size={8} wrap>
                          <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            loading={!!retryingJobs[selectedJob.id]}
                            onClick={() => retryJob(selectedJob)}
                          >
                            重新執行
                          </Button>
                          {isAdmin && (
                            <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                              刪除失敗工作
                            </Button>
                          )}
                        </Space>
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

                <Card className="featured-jobs-card">
                  <div className="card-title">
                    <Title level={4} style={{ margin: 0 }}>首頁精選成果</Title>
                    <Text type="secondary">挑選示範影片直接播放與評分。</Text>
                  </div>
                  {!jobsLoaded ? (
                    <Alert type="info" showIcon message="正在載入精選成果" />
                  ) : featuredJobs.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message={isAdmin ? '尚未釘選首頁精選成果' : '目前尚未設定首頁精選成果'}
                      description={isAdmin ? '到工作總覽或最新成果卡片，把適合示範的完成工作設為首頁精選。' : undefined}
                    />
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {featuredJobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          className={`featured-job-button ${selectedJobId === job.id ? 'is-selected' : ''}`}
                          onClick={() => setSelectedJobId(job.id)}
                        >
                          <span>
                            <Text strong ellipsis>{jobDisplayTitle(job)}</Text>
                            <br />
                            <Text type="secondary">
                              {formatRatingText(job.rating_average, job.rating_count || 0)}
                              {job.play_count ? ` · 播放 ${job.play_count} 次` : ''}
                            </Text>
                          </span>
                          <Tag color="gold">精選</Tag>
                        </button>
                      ))}
                    </Space>
                  )}
                </Card>

                <Card className="preferences-card">
                  <div className="card-title">
                    <Title level={3} style={{ margin: 0 }}>{t('preferences')}</Title>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      使用者介面、時間格式、登入狀態與管理員系統設定集中在這裡調整。
                    </Paragraph>
                  </div>
                  <Form layout="vertical">
                    <Form.Item label="介面語言">
                      <Select
                        value={uiLanguage}
                        options={UI_LANGUAGES}
                        onChange={changeUiLanguage}
                      />
                    </Form.Item>
                    <Form.Item label={t('dateTimeFormat')}>
                      <Select<DateTimeFormatPreference>
                        aria-label={t('dateTimeFormat')}
                        value={dateTimeFormat}
                        onChange={changeDateTimeFormat}
                        options={[
                          { value: 'system', label: t('dateSystem') },
                          { value: 'taiwan', label: t('dateTaiwan') },
                          { value: 'us', label: t('dateUs') },
                          { value: 'iso', label: t('dateIso') },
                        ]}
                      />
                    </Form.Item>
                  </Form>
                </Card>

                {!signedIn ? (
                  <Card className="account-card preferences-card">
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
                    <Divider />
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <div>
                        <Text strong>Email 登入</Text>
                        <br />
                        <Text type="secondary">目前開放用 email 登入，登入後可保留自己的評分與申請紀錄。</Text>
                      </div>
                      <Flex gap={8} wrap>
                        <Input
                          type="email"
                          value={loginEmail}
                          onChange={(event) => setLoginEmail(event.target.value)}
                          onPressEnter={signIn}
                          placeholder="your@email.com"
                          style={{ flex: '1 1 240px' }}
                        />
                        <Button type="primary" icon={<LockOutlined />} onClick={signIn}>
                          登入
                        </Button>
                      </Flex>
                    </Space>
	                  </Card>
                ) : !isAdmin ? (
                  <Card className="account-card preferences-card">
                    <div className="card-title">
                      <Title level={3}>帳號</Title>
                      <Paragraph type="secondary">
                        已登入為 {auth?.email || '使用者'}。你可以對詞條、語音和影片評分；每筆資料只能保留一個自己的分數，但可以再次修改。
                      </Paragraph>
                    </div>
                    <Button icon={<LogoutOutlined />} onClick={logout}>登出</Button>
                  </Card>
                ) : (
                  <Card className="admin-card preferences-card">
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
                              key: 'translator',
                              label: '台語翻譯後端',
                              children: (
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                  <Paragraph type="secondary" style={{ margin: 0 }}>
                                    預設使用內建規則翻譯。若啟用 TW-Hokkien-LLM，請提供 OpenAI-compatible Completions API，例如本機 llama.cpp server 的 /v1。
                                  </Paragraph>
                                  <Form.Item label="Translator backend" name="translator_backend">
                                    <Select options={[
                                      { value: 'rule', label: '內建規則翻譯' },
                                      { value: 'tw_hokkien_llm', label: 'TW-Hokkien-LLM Translator' },
                                    ]} />
                                  </Form.Item>
                                  <Form.Item label="Translator API base URL" name="translator_api_base_url">
                                    <Input placeholder="http://127.0.0.1:8080/v1" />
                                  </Form.Item>
                                  <Form.Item label="Translator model" name="translator_model">
                                    <Input placeholder="例如：Bohanlu/Taigi-Llama-2-Translator-7B 或 llama.cpp model alias" />
                                  </Form.Item>
                                  <Form.Item label="Translator API key" name="translator_api_key">
                                    <Input.Password placeholder="本機服務可留空" />
                                  </Form.Item>
                                  <Form.Item label="目標書寫系統" name="translator_target_language">
                                    <Select options={[
                                      { value: 'HAN', label: '台語漢字（HAN）' },
                                      { value: 'HL', label: '漢羅（HL）' },
                                      { value: 'POJ', label: '白話字（POJ）' },
                                    ]} />
                                  </Form.Item>
                                  <Form.Item label="Timeout（秒）" name="translator_timeout_seconds">
                                    <InputNumber min={5} max={600} step={5} style={{ width: '100%' }} />
                                  </Form.Item>
                                </Space>
                              ),
                            },
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
                                    <Input placeholder="https://static-taigi.yihua.app" />
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
                      <div><Text type="secondary">網頁造訪</Text><strong>{stats.page_visits_total ?? stats.actions?.page_visit ?? 0}</strong></div>
                      <div><Text type="secondary">今日造訪</Text><strong>{stats.page_visits_today ?? (stats.daily ?? []).at(-1)?.actions?.page_visit ?? 0}</strong></div>
                    </div>
                  )}
                  {stats && (
                    <div className="stats-trends">
                      <Title level={4}>工作成果正確率與語詞資料庫品質</Title>
                      <div className="stats-grid">
                        <div><Text type="secondary">工作成果正確率</Text><strong>{formatPercent(stats.job_quality?.ok_rate)}</strong></div>
                        <div><Text type="secondary">工作成果有問題率</Text><strong>{formatPercent(stats.job_quality?.problem_rate)}</strong></div>
                        <div><Text type="secondary">成果標示沒問題</Text><strong>{stats.job_quality?.ok_count ?? 0}</strong></div>
                        <div><Text type="secondary">成果標示有問題</Text><strong>{stats.job_quality?.problem_count ?? 0}</strong></div>
                        <div><Text type="secondary">中文語音未轉台語</Text><strong>{stats.job_quality?.chinese_voice_not_taigi_count ?? 0}</strong></div>
                        <div><Text type="secondary">成果已標示</Text><strong>{stats.job_quality?.reviewed_total ?? 0}</strong></div>
                        <div><Text type="secondary">成果尚未標示</Text><strong>{stats.job_quality?.unreviewed_count ?? 0}</strong></div>
                        <div><Text type="secondary">詞條已評分</Text><strong>{stats.lexicon_quality?.word_entries_rated ?? 0}</strong></div>
                        <div><Text type="secondary">詞條未評分</Text><strong>{stats.lexicon_quality?.word_entries_unrated ?? 0}</strong></div>
                        <div><Text type="secondary">語音影片已評分</Text><strong>{stats.lexicon_quality?.word_assets_rated ?? 0}</strong></div>
                        <div><Text type="secondary">語音影片未評分</Text><strong>{stats.lexicon_quality?.word_assets_unrated ?? 0}</strong></div>
                        <div><Text type="secondary">問題詞料</Text><strong>{stats.lexicon_quality?.word_problem_count ?? 0}</strong></div>
                        <div><Text type="secondary">語句斷詞有問題</Text><strong>{stats.lexicon_quality?.word_token_problem_count ?? 0}</strong></div>
                        <div><Text type="secondary">語句斷詞沒問題</Text><strong>{stats.lexicon_quality?.word_token_ok_count ?? 0}</strong></div>
                        <div><Text type="secondary">有斷詞回饋語句</Text><strong>{stats.lexicon_quality?.word_token_reviewed_entries ?? 0}</strong></div>
                        <div><Text type="secondary">分段斷詞有問題</Text><strong>{stats.lexicon_quality?.segment_token_problem_count ?? 0}</strong></div>
                        <div><Text type="secondary">分段斷詞沒問題</Text><strong>{stats.lexicon_quality?.segment_token_ok_count ?? 0}</strong></div>
                        <div><Text type="secondary">音訊校對工作</Text><strong>{stats.lexicon_quality?.audio_review_requests ?? 0}</strong></div>
                        <div><Text type="secondary">音訊校對完成</Text><strong>{stats.lexicon_quality?.audio_review_complete ?? 0}</strong></div>
                        <div><Text type="secondary">重新生成申請</Text><strong>{stats.lexicon_quality?.word_regeneration_requests ?? 0}</strong></div>
                        <div><Text type="secondary">多語系申請</Text><strong>{stats.lexicon_quality?.word_translation_requests ?? 0}</strong></div>
                        <div><Text type="secondary">資料匯出申請</Text><strong>{stats.lexicon_quality?.source_export_requests ?? 0}</strong></div>
                        <div><Text type="secondary">匯出申請人</Text><strong>{stats.lexicon_quality?.source_export_requesters ?? 0}</strong></div>
                        <div><Text type="secondary">語詞查詢</Text><strong>{stats.lexicon_quality?.word_queries_total ?? 0}</strong></div>
                      </div>
                      <div className="rating-distribution-grid">
                        <div>
                          <Text strong>詞條平均評分分布</Text>
                          <div className="rating-distribution">
                            {ratingScores.map((score) => (
                              <div key={`word-entry-rating-${score}`}>
                                <Text type="secondary">{score} 星</Text>
                                <strong>{stats.lexicon_quality?.word_entry_rating_buckets?.[String(score) as keyof RatingBuckets] ?? 0}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Text strong>語音平均評分分布</Text>
                          <div className="rating-distribution">
                            {ratingScores.map((score) => (
                              <div key={`word-asset-rating-${score}`}>
                                <Text type="secondary">{score} 星</Text>
                                <strong>{stats.lexicon_quality?.word_asset_rating_buckets?.[String(score) as keyof RatingBuckets] ?? 0}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
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
                              {' '}造訪 {day.actions?.page_visit || 0}
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

                <Card className="about-card">
                  <Flex align="start" justify="space-between" gap={12} wrap className="card-title">
                    <div>
                      <Title level={3} style={{ margin: 0 }}>{t('aboutTitle')}</Title>
                      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        {t('aboutIntro')}
                      </Paragraph>
                    </div>
                    <Button href="https://github.com/yihua1218/VoxCPM" target="_blank" rel="noreferrer" icon={<LinkOutlined />}>
                      GitHub
                    </Button>
                  </Flex>
                  <div className="about-grid">
                    <div>
                      <Text strong>{t('aboutFlowTitle')}</Text>
                      <Paragraph type="secondary">
                        {t('aboutFlowText')}
                      </Paragraph>
                    </div>
                    <div>
                      <Text strong>{t('aboutReviewTitle')}</Text>
                      <Paragraph type="secondary">
                        {t('aboutReviewText')}
                      </Paragraph>
                    </div>
                    <div>
                      <Text strong>{t('aboutLexiconTitle')}</Text>
                      <Paragraph type="secondary">
                        {t('aboutLexiconText')}
                      </Paragraph>
                    </div>
                    <div>
                      <Text strong>{t('aboutProjectTitle')}</Text>
                      <Paragraph copyable={{ text: 'https://github.com/yihua1218/VoxCPM' }} style={{ marginBottom: 0 }}>
                        <a href="https://github.com/yihua1218/VoxCPM" target="_blank" rel="noreferrer">
                          https://github.com/yihua1218/VoxCPM
                        </a>
                      </Paragraph>
                      <Text type="secondary">{t('aboutProjectText')}</Text>
                    </div>
                  </div>
                </Card>

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
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <div className="source-section">
                        <Flex align="center" justify="space-between" gap={12} wrap>
                          <div>
                            <Text strong>申請匯出網站多語系資料</Text>
                            <br />
                            <Text type="secondary">
                              {auth?.email
                                ? `目前會先留下申請紀錄，包含 ${auth.email}、語言範圍、格式與申請時間；資料檔案正式開放時可依紀錄通知。`
                                : '匯出申請需要 email 登入；匿名使用者仍可在下方申請新增詞料。'}
                            </Text>
                          </div>
                          <Button type="primary" loading={requestingSourceExport} disabled={!auth?.email} onClick={requestSourceExport}>
                            申請匯出 JSON
                          </Button>
                        </Flex>
                      </div>

                      <div className="source-section">
                        <Text strong>申請增加多語系資料詞條</Text>
                        <Paragraph type="secondary">
                          匿名使用者可以申請新增詞料；email 登入使用者送出後會同時排入繁中、簡中、英文、日文、韓文、台語與台羅語料需求。
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
                </Card>

                <Card className="lexicon-card">
                  <Flex align="center" justify="space-between" className="card-title" gap={12}>
                    <Title level={3} style={{ margin: 0 }}>{t('lexiconTitle')}</Title>
                    <Text type="secondary">{visibleWords.length} / {words.length} loaded · {wordsTotal} total</Text>
                  </Flex>
                  <div className="lexicon-controls">
                    <Input.Search
                      allowClear
                      placeholder={t('lexiconSearch')}
                      value={wordQuery}
                      onChange={(event) => setLexiconQuery(event.target.value)}
                      onSearch={(value) => loadWords(value)}
                    />
                    <Select<WordSort>
                      value={wordSort}
                      onChange={setWordSort}
                      options={[
                        { value: 'rating', label: '評分最高' },
                        { value: 'newest', label: '最新更新' },
                        { value: 'plays', label: '播放最多' },
                        { value: 'usage', label: '使用最多' },
                        { value: 'source', label: '詞條排序' },
                      ]}
                    />
                    <Select<WordKindFilter>
                      value={wordKindFilter}
                      onChange={setWordKindFilter}
                      options={[
                        { value: 'all', label: '全部類型' },
                        { value: 'word', label: '詞語' },
                        { value: 'phrase', label: '固定語句' },
                      ]}
                    />
                    <Select<WordRatingFilter>
                      value={wordRatingFilter}
                      onChange={setWordRatingFilter}
                      options={[
                        { value: 'all', label: '全部評分' },
                        { value: 'rated', label: '已評分' },
                        { value: 'unrated', label: '未評分' },
                      ]}
                    />
                    <Select<WordMediaFilter>
                      value={wordMediaFilter}
                      onChange={setWordMediaFilter}
                      options={[
                        { value: 'all', label: '全部媒體' },
                        { value: 'audio', label: '有語音' },
                        { value: 'video', label: '有影片' },
                        { value: 'missing_audio', label: '缺語音' },
                      ]}
                    />
                    <Select<WordStatusFilter>
                      value={wordStatusFilter}
                      onChange={setWordStatusFilter}
                      options={[
                        { value: 'all', label: '全部狀態' },
                        { value: 'problem', label: '有問題' },
                        { value: 'ok', label: '無問題' },
                        { value: 'generating', label: '生成中' },
                        { value: 'requested', label: '新增申請' },
                      ]}
                    />
                  </div>
                  {!!normalizedWordQuery && words.length > 0 && !wordHasExactMatch && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="沒有完全相同的詞條"
                      description={(
                        <Flex align="center" justify="space-between" gap={12} wrap>
                          <Space direction="vertical" size={2}>
                            <Text>{t('requestNewWordHint')}</Text>
                            <Text type="secondary">{t('itaigiReferenceHint')}</Text>
                          </Space>
                          <Space wrap>
                            <Button icon={<LinkOutlined />} href={itaigiSearchUrl(wordQuery)} target="_blank">
                              {t('itaigiReference')}
                            </Button>
                            <Button type="primary" onClick={requestMissingWord}>
                              {t('requestNewWord')}：{wordQuery.trim()}
                            </Button>
                          </Space>
                        </Flex>
                      )}
                    />
                  )}
                  {words.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message={t('lexiconEmpty')}
                      description={wordQuery.trim() ? (
                        <Flex align="center" justify="space-between" gap={12} wrap>
                          <Space direction="vertical" size={2}>
                            <Text>{t('requestNewWordHint')}</Text>
                            <Text type="secondary">{t('itaigiReferenceHint')}</Text>
                          </Space>
                          <Space wrap>
                            <Button icon={<LinkOutlined />} href={itaigiSearchUrl(wordQuery)} target="_blank">
                              {t('itaigiReference')}
                            </Button>
                            <Button type="primary" onClick={requestMissingWord}>
                              {t('requestNewWord')}：{wordQuery.trim()}
                            </Button>
                          </Space>
                        </Flex>
                      ) : undefined}
                    />
                  ) : visibleWords.length === 0 ? (
                    <Alert type="info" showIcon message="沒有符合目前排序與篩選條件的詞條。" />
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {visibleWords.map((word) => {
                        const asset = primaryWordAsset(word);
                        const expanded = !!expandedWordIds[word.id];
                        const isGenerating = word.generation_status && ['queued', 'running'].includes(word.generation_status);
                        const selectedTokenCount = wordSelectedTokens(word).length;
                        return (
                          <div key={word.id} className={`word-row ${word.problem ? 'has-problem' : ''}`}>
                            <Flex align="start" justify="space-between" gap={10} className="word-row-main">
                              <div className="word-row-summary">
                                <div className="word-row-title">
                                  <Text strong>{word.source}</Text>
                                  <Tag color={word.kind === 'phrase' ? 'purple' : 'blue'}>
                                    {word.category || (word.kind === 'phrase' ? '固定語句' : '詞語')}
                                  </Tag>
                                  {word.status === 'requested' && <Tag color="warning">新增申請</Tag>}
                                  {word.problem && <Tag color="error">需處理</Tag>}
                                  {word.problem && <ProblemTypeTag problemType={word.problem_type} />}
                                  {(word.token_problem_count ?? 0) > 0 && <Tag color="error">斷詞問題 {word.token_problem_count}</Tag>}
                                  {(word.token_ok_count ?? 0) > 0 && <Tag color="success">斷詞確認 {word.token_ok_count}</Tag>}
                                  {isGenerating && <Tag color="processing">生成中</Tag>}
                                  {word.generation_status === 'failed' && <Tag color="error">生成失敗</Tag>}
                                  <Tag color="default">{word.count}</Tag>
                                </div>
                                <Text>{word.taigi}</Text>
                                <Text type="secondary">{word.tailo}</Text>
                                <Space size={8} wrap className="word-row-meta">
                                  {!!word.play_count && <Text type="secondary">播放 {word.play_count} 次</Text>}
                                  {!!word.rating_count && (
                                    <Text type="secondary">{formatRatingText(word.rating_average, word.rating_count)}</Text>
                                  )}
                                  {!!word.request_count && <Text type="secondary">新增申請 {word.request_count} 次</Text>}
                                  {word.note && <Text type="secondary">{word.note}</Text>}
                                </Space>
                              </div>
                              <Space size={8} wrap className="word-row-actions">
                                <Flex align="center" gap={6} wrap className="word-row-rating">
                                  <Text type="secondary">詞條評分</Text>
                                  <Rate value={word.my_rating ?? 0} onChange={(rating) => rateWord(word, rating)} />
                                </Flex>
                                {asset?.has_audio ? (
                                  <Button size="small" icon={<AudioOutlined />} onClick={() => playWordAudio(word)}>
                                    播放語音
                                  </Button>
                                ) : (
                                  <Button size="small" icon={<AudioOutlined />} onClick={() => generateWordAudio(word, wordSynthesisSources[word.id] ?? 'taigi')}>
                                    產生語音
                                  </Button>
                                )}
                                <Button size="small" icon={<FileTextOutlined />} onClick={() => toggleWordDetails(word.id)}>
                                  {expanded ? '收合詳細' : '詳細'}
                                </Button>
                              </Space>
                            </Flex>
                            {expanded && (
                              <div className="word-row-details">
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
                                <Flex align="center" gap={10} wrap className="synthesis-source-control">
                                  <Text strong>新語音合成來源</Text>
                                  <Select<SynthesisSource>
                                    size="small"
                                    value={wordSynthesisSources[word.id] ?? 'taigi'}
                                    onChange={(value) => setWordSynthesisSources((current) => ({ ...current, [word.id]: value }))}
                                    options={[
                                      { value: 'taigi', label: '台語文字' },
                                      { value: 'tailo', label: '台羅拼音' },
                                    ]}
                                  />
                                  <Text type="secondary">每次生成會記錄來源，方便比較差異。</Text>
                                </Flex>
                                <div className="itaigi-reference-panel">
                                  <Flex align="center" justify="space-between" gap={8} wrap>
                                    <Space direction="vertical" size={2}>
                                      <Text strong>iTaigi 參考語料</Text>
                                      <Text type="secondary">查詢 iTaigi 詞條、台羅與合成音檔，套用後會用該台羅重新產生詞語語音。</Text>
                                    </Space>
                                    <Space size={8} wrap>
                                      <Button size="small" icon={<LinkOutlined />} href={itaigiSearchUrl(word.source)} target="_blank">
                                        開啟 iTaigi
                                      </Button>
                                      <Button
                                        size="small"
                                        icon={<FileSearchOutlined />}
                                        loading={!!loadingItaigiReferences[word.id]}
                                        onClick={() => loadItaigiReference(word)}
                                      >
                                        查詢參考
                                      </Button>
                                    </Space>
                                  </Flex>
                                  {word.itaigi_reference?.tailo && (
                                    <Alert
                                      type="success"
                                      showIcon
                                      message="目前已套用 iTaigi 參考"
                                      description={`${word.itaigi_reference.taigi} / ${word.itaigi_reference.tailo}`}
                                    />
                                  )}
                                  {itaigiReferences[word.id] && (
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                      <Text type="secondary">{itaigiReferences[word.id].license_note}</Text>
                                      {itaigiReferences[word.id].candidates.length === 0 ? (
                                        <Alert type="info" showIcon message="iTaigi 目前沒有符合的參考語料。" />
                                      ) : (
                                        itaigiReferences[word.id].candidates.map((candidate) => {
                                          const applyKey = `${word.id}:${candidate.id || candidate.tailo}`;
                                          return (
                                            <div key={applyKey} className="itaigi-reference-row">
                                              <Flex align="center" justify="space-between" gap={10} wrap>
                                                <Space direction="vertical" size={2}>
                                                  <Text strong>{candidate.taigi}</Text>
                                                  <Text type="secondary">{candidate.tailo}</Text>
                                                  <Text type="secondary">
                                                    按呢講好 {candidate.good ?? 0}，按呢怪怪 {candidate.bad ?? 0}
                                                    {candidate.contributor ? ` · ${candidate.contributor}` : ''}
                                                  </Text>
                                                </Space>
                                                <Space size={8} wrap>
                                                  {candidate.audio_url && (
                                                    <audio controls preload="none" src={candidate.audio_url} />
                                                  )}
                                                  <Button
                                                    size="small"
                                                    type="primary"
                                                    loading={!!applyingItaigiReferences[applyKey]}
                                                    onClick={() => applyItaigiReference(word, candidate)}
                                                  >
                                                    套用並重新產生
                                                  </Button>
                                                </Space>
                                              </Flex>
                                            </div>
                                          );
                                        })
                                      )}
                                    </Space>
                                  )}
                                </div>
                                {(word.source_tokens ?? []).length > 1 && (
                                  <div className="segment-token-panel">
                                    <Flex align="center" justify="space-between" gap={8} wrap>
                                      <Space size={8} wrap>
                                        <Text strong>語句斷詞標示</Text>
                                        <Tag>{word.source_tokens?.length ?? 0} 詞</Tag>
                                        {(word.token_problem_count ?? 0) > 0 && <Tag color="error">有問題 {word.token_problem_count}</Tag>}
                                        {(word.token_ok_count ?? 0) > 0 && <Tag color="success">沒問題 {word.token_ok_count}</Tag>}
                                        {selectedTokenCount > 0 && <Tag color="processing">已選 {selectedTokenCount}</Tag>}
                                      </Space>
                                      <Space size={6} wrap>
                                        <Button size="small" danger onClick={() => markWordTokens(word, 'problem')}>
                                          標示有問題
                                        </Button>
                                        <Button size="small" onClick={() => markWordTokens(word, 'ok')}>
                                          標示沒問題
                                        </Button>
                                        <Button size="small" disabled={selectedTokenCount === 0} onClick={() => clearWordTokenSelection(word.id)}>
                                          清除選取
                                        </Button>
                                      </Space>
                                    </Flex>
                                    <div className="segment-token-list">
                                      {(word.source_tokens ?? []).map((token, tokenIndex) => (
                                        <button
                                          type="button"
                                          key={`${word.id}-${token.source}-${tokenIndex}`}
                                          className={[
                                            'segment-token',
                                            token.problem ? 'has-problem' : '',
                                            wordTokenStatus(token) === 'problem' ? 'is-reviewed-problem' : '',
                                            wordTokenStatus(token) === 'ok' ? 'is-reviewed-ok' : '',
                                            selectedWordTokens[word.id]?.includes(segmentTokenKey(token)) ? 'is-selected' : '',
                                          ].filter(Boolean).join(' ')}
                                          onClick={() => toggleWordToken(word, token)}
                                        >
                                          <span>{token.source}</span>
                                          {wordTokenStatus(token) === 'problem' && <small>有問題</small>}
                                          {wordTokenStatus(token) === 'ok' && <small>沒問題</small>}
                                          {!wordTokenStatus(token) && token.exists && <small>{token.problem ? '問題' : token.has_audio ? '有音檔' : '詞庫'}</small>}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
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
                                    {(word.assets ?? []).map((assetItem, index) => (
                                      <div key={assetItem.id} className="word-asset-row">
                                        <Flex align="center" justify="space-between" gap={10} wrap>
                                          <Space size={8} wrap>
                                            <Tag color={assetItem.matches_current_reference ? 'green' : index === 0 ? 'gold' : 'blue'}>
                                              {assetItem.matches_current_reference ? '套用參考後生成' : index === 0 ? '目前最高排序' : `版本 ${index + 1}`}
                                            </Tag>
                                            {assetItem.synthesis_source && (
                                              <Tag color={assetItem.synthesis_source === 'tailo' ? 'cyan' : 'default'}>
                                                {synthesisSourceLabel(assetItem.synthesis_source)}
                                              </Tag>
                                            )}
                                            <Text type="secondary">
                                              {assetItem.generated_by_name || '匿名使用者'} · {assetItem.created_at ? formatDateTime(assetItem.created_at) : '未知時間'}
                                            </Text>
                                            {!!assetItem.rating_count && (
                                              <Text type="secondary">{formatRatingText(assetItem.rating_average, assetItem.rating_count)}</Text>
                                            )}
                                            {!!assetItem.play_count && <Text type="secondary">播放 {assetItem.play_count} 次</Text>}
                                          </Space>
                                        </Flex>
                                        {assetItem.synthesis_text && (
                                          <Text type="secondary">合成文字：{assetItem.synthesis_text}</Text>
                                        )}
                                        {assetItem.has_audio && (
                                          <div>
                                            <audio
                                              controls
                                              preload="none"
                                              src={wordAssetMediaSrc(word, assetItem, 'audio')}
                                              style={{ width: '100%', marginTop: 8 }}
                                            />
                                            <Flex align="center" gap={8} wrap className="word-asset-rating">
                                              <Text type="secondary">正確度評分</Text>
                                              <Rate value={assetItem.my_rating ?? 0} onChange={(rating) => rateWordAsset(word, assetItem, rating)} />
                                            </Flex>
                                            <Space size={8} wrap className="share-actions">
                                              <Button size="small" icon={<DownloadOutlined />} href={wordAssetDownloadSrc(word, assetItem, 'audio')}>下載語音</Button>
                                              <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:audio`, word.source, 'copy')}>複製音訊連結</Button>
                                              <Button size="small" onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:audio`, word.source, 'line')}>LINE</Button>
                                              <Button size="small" onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:audio`, word.source, 'facebook')}>Facebook</Button>
                                            </Space>
                                          </div>
                                        )}
                                        <div className="word-video-actions">
                                          <Space size={8} wrap>
                                            {assetItem.has_video ? (
                                              <>
                                              <Button size="small" icon={<VideoCameraOutlined />} onClick={() => openWordAssetVideo(word, assetItem)}>
                                                開新視窗播放影片
                                              </Button>
                                              <Button size="small" icon={<DownloadOutlined />} href={wordAssetDownloadSrc(word, assetItem, 'video')}>下載影片</Button>
                                              <Button size="small" icon={<CopyOutlined />} onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:video`, word.source, 'copy')}>複製影片連結</Button>
                                              <Button size="small" onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:video`, word.source, 'line')}>LINE</Button>
                                              <Button size="small" onClick={() => shareMedia(`word:${word.id}:${assetItem.id}:video`, word.source, 'facebook')}>Facebook</Button>
                                              </>
                                            ) : assetItem.has_audio ? (
                                              <Button
                                                size="small"
                                                icon={<VideoCameraOutlined />}
                                                loading={!!generatingWordVideos[`${word.id}:${assetItem.id}`]}
                                                onClick={() => generateWordVideo(word, assetItem)}
                                              >
                                                產生影片
                                              </Button>
                                            ) : null}
                                          </Space>
                                        </div>
                                      </div>
                                    ))}
                                  </Space>
                                )}
                                <Flex align="center" justify="space-between" gap={10} wrap>
                                  <Text type="secondary">詞條評分可直接在精簡列調整。</Text>
                                  <Space size={8} wrap>
                                    <Button size="small" type={word.problem ? 'primary' : 'default'} onClick={() => generateWordAudio(word, wordSynthesisSources[word.id] ?? 'taigi')}>
                                      {word.problem ? t('regenerateWord') : t('generateWord')}
                                    </Button>
                                    <Button size="small" onClick={() => reportWordIssue(word)}>
                                      {t('reportIssue')}
                                    </Button>
                                    <Button size="small" danger onClick={() => reportWordIssue(word, 'chinese_voice_not_taigi')}>
                                      中文語音未轉台語
                                    </Button>
                                    <Button size="small" onClick={() => requestWordCorpus(word)}>
                                      {t('requestCorpus')}
                                    </Button>
                                  </Space>
                                </Flex>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {wordsHasMore && (
                        <Flex justify="center">
                          <Button loading={loadingWords} onClick={() => loadWords(wordQueryRef.current, true)}>
                            載入更多詞條
                          </Button>
                        </Flex>
                      )}
                    </Space>
                  )}
                </Card>

                <Card className="jobs-card">
                  <Flex align="center" justify="space-between" className="card-title">
                    <Title level={3} style={{ margin: 0 }}>{t('jobs')}</Title>
                    <Text type="secondary">{jobsLoaded ? `${jobs.length} / ${jobsTotal} 筆` : '載入中'}</Text>
                  </Flex>
                  <div className="job-overview-controls">
                    <Input.Search
                      allowClear
                      placeholder="搜尋已完成/失敗工作、標題、內容、台語、台羅"
                      value={jobSearch}
                      onChange={(event) => setJobSearch(event.target.value)}
                      onSearch={(value) => {
                        setJobSearch(value);
                        loadJobs({ query: value }).catch(() => undefined);
                      }}
                    />
                    <Select<CompletedJobSort>
                      value={completedJobSort}
                      onChange={setCompletedJobSort}
                      options={[
                        { value: 'newest', label: '最新優先' },
                        { value: 'oldest', label: '最舊優先' },
                        { value: 'rating', label: '評分最高' },
                        { value: 'plays', label: '播放最多' },
                        { value: 'duration', label: `${t('elapsedLabel')}最長` },
                        { value: 'title', label: '標題排序' },
                      ]}
                    />
                    <Select<JobKindFilter>
                      value={completedJobKindFilter}
                      onChange={setCompletedJobKindFilter}
                      options={[
                        { value: 'all', label: '全部類型' },
                        { value: 'script', label: '稿件影片' },
                        { value: 'segment_regeneration', label: '重生分段' },
                        { value: 'word_asset', label: '詞語語音' },
                        { value: 'maintenance', label: '維護清理' },
                        { value: 'audio_review', label: '音訊校對' },
                      ]}
                    />
                    <Select<CompletedJobContentFilter>
                      value={completedJobContentFilter}
                      onChange={setCompletedJobContentFilter}
                      options={[
                        { value: 'all', label: '全部內容' },
                        { value: 'long_article', label: '長篇文章' },
                        { value: 'short_word_audio', label: '短詞語音' },
                      ]}
                    />
                    <Select<CompletedJobRatingFilter>
                      value={completedJobRatingFilter}
                      onChange={setCompletedJobRatingFilter}
                      options={[
                        { value: 'all', label: '全部評分' },
                        { value: 'rated', label: '已有評分' },
                        { value: 'unrated', label: '尚未評分' },
                      ]}
                    />
                    <Select<CompletedJobIssueFilter>
                      value={completedJobIssueFilter}
                      onChange={setCompletedJobIssueFilter}
                      options={[
                        { value: 'all', label: '全部問題狀態' },
                        { value: 'problem', label: '成果有問題' },
                        { value: 'chinese_voice_not_taigi', label: '中文語音未轉台語' },
                        { value: 'ok', label: '標示沒問題' },
                        { value: 'unreviewed', label: '尚未標示' },
                      ]}
                    />
                    <Select<CompletedJobMediaFilter>
                      value={completedJobMediaFilter}
                      onChange={setCompletedJobMediaFilter}
                      options={[
                        { value: 'all', label: '全部媒體' },
                        { value: 'video', label: '有影片' },
                        { value: 'audio', label: '有音訊' },
                      ]}
                    />
                  </div>
                  {isAdmin && (
                    <div className="admin-batch-tool">
                      <Flex align="center" justify="space-between" gap={12} wrap>
                        <div>
                          <Text strong>特定詞批次重生工具</Text>
                          <br />
                          <Text type="secondary">搜尋含指定詞的已完成稿件分段，先寫入轉譯記憶，再批次排程重生語音。</Text>
                        </div>
                        <Space size={8} wrap>
                          <Input
                            value={termSearch}
                            onChange={(event) => setTermSearch(event.target.value)}
                            placeholder="搜尋詞，例如：美元"
                            style={{ width: 160 }}
                          />
                          <Input
                            value={termReplacement}
                            onChange={(event) => setTermReplacement(event.target.value)}
                            placeholder="台語替換，例如：美金"
                            style={{ width: 160 }}
                          />
                          <Button loading={runningTermBatch} onClick={() => runTermBatchRegeneration(true)}>
                            搜尋段落
                          </Button>
                          <Button type="primary" loading={runningTermBatch} onClick={() => runTermBatchRegeneration(false)}>
                            批次排程重生
                          </Button>
                        </Space>
                      </Flex>
                      {termBatchResult && (
                        <Alert
                          type={termBatchResult.queued_jobs.length ? 'success' : 'info'}
                          showIcon
                          message={`${termBatchResult.search_term} → ${termBatchResult.taigi_replacement}`}
                          description={`找到 ${termBatchResult.match_count} 個相關分段，${termBatchResult.regeneratable_count} 個可重生；已排程 ${termBatchResult.queued_jobs.length} 筆工作。`}
                        />
                      )}
                    </div>
                  )}
                  {!jobsLoaded || (loadingJobs && jobs.length === 0) ? (
                    <Alert type="info" showIcon message="正在載入工作資料" />
                  ) : jobs.length === 0 ? (
                    <Alert type="info" showIcon message={signedIn ? '目前沒有工作' : '目前沒有已完成的公開工作'} />
                  ) : (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      {jobGroups.map((group) => (
                        <div key={group.key} className="job-group">
                          <Flex align="center" justify="space-between" className="job-group-title">
                            <Space size={8} wrap>
                              <Text strong>{group.label}</Text>
                              <Tag>{group.jobs.length}</Tag>
                              {group.key === 'complete' && (
                                <Text type="secondary">符合目前條件</Text>
                              )}
                            </Space>
                            {group.key === 'queued' && group.jobs.length > 0 && (
                              <Button size="small" onClick={() => setShowQueuedJobs((current) => !current)}>
                                {showQueuedJobs ? '收合隊列' : `展開 ${group.jobs.length} 筆隊列`}
                              </Button>
                            )}
                          </Flex>
                          {group.key === 'queued' && group.collapsed && group.jobs.length > 0 ? (
                            <Alert type="info" showIcon message={`目前有 ${group.jobs.length} 筆工作在隊列中`} description="點選展開才顯示隊列中的工作項目。" />
                          ) : group.jobs.length === 0 ? (
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
                                    <Tag color={jobKindColor(job)}>{jobKindLabel(job, t)}</Tag>
                                    <Tag color={statusColor[job.status]}>{job.status}</Tag>
                                    {job.featured_at && <Tag color="gold">首頁精選</Tag>}
                                    {job.problem && <Tag color="error">成果有問題</Tag>}
                                    {job.problem && <ProblemTypeTag problemType={job.problem_type} />}
                                  </div>
                                  <Progress percent={job.progress} size="small" showInfo={false} />
                                  <PipelineStrip job={job} compact />
                                  <Text type="secondary">
                                    {job.stage} · {formatDateTime(job.updated_at)}
                                    {formatDurationText(job.elapsed_seconds) ? ` · ${t('elapsedLabel')} ${formatDurationText(job.elapsed_seconds)}` : ''}
                                    {job.rating_count ? ` · ${formatRatingText(job.rating_average, job.rating_count)}` : ''}
                                    {job.play_count ? ` · 播放 ${job.play_count} 次` : ''}
                                  </Text>
                                </button>
                                {job.status === 'complete' && selectedJob?.id === job.id && (
                                  <div className="job-row-actions">
                                    {(job.audio_path || job.video_path) && (
                                      <div className="job-row-media">
                                        {job.audio_path && (
                                          <div className="job-inline-player">
                                            <Text type="secondary">音訊</Text>
                                            <audio controls preload="none" src={jobMediaSrc(job, 'audio')} />
                                          </div>
                                        )}
                                        {job.video_path && (
                                          <div className="job-inline-player">
                                            <Text type="secondary">影片</Text>
                                            <video controls preload="none" src={jobMediaSrc(job, 'video')} />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <Flex align="center" justify="space-between" gap={10} wrap>
                                      <Flex align="center" gap={8} wrap>
                                        <Text type="secondary">我的評分</Text>
                                        <Rate value={job.my_rating ?? 0} onChange={(rating) => rateJob(job, rating)} />
                                        {job.problem ? (
                                          <Text type="danger">{job.problem_reason || '已標示成果有問題'}</Text>
                                        ) : (
                                          <Text type="secondary">尚未標示問題</Text>
                                        )}
                                      </Flex>
                                      <Space size={8} wrap>
                                        <Button size="small" danger={job.problem} onClick={() => markJobIssue(job, job.problem ? 'ok' : 'problem')}>
                                          {job.problem ? '標示沒問題' : '標示成果有問題'}
                                        </Button>
                                        {job.problem_type !== 'chinese_voice_not_taigi' && (
                                          <Button size="small" danger onClick={() => markJobIssue(job, 'problem', 'chinese_voice_not_taigi')}>
                                            中文語音未轉台語
                                          </Button>
                                        )}
                                        {isAdmin && job.status === 'complete' && (
                                          <Button size="small" onClick={() => setJobFeatured(job, !job.featured_at)}>
                                            {job.featured_at ? '取消精選' : '設為首頁精選'}
                                          </Button>
                                        )}
                                        {isAdmin && job.kind === 'script' && (
                                          <Button
                                            size="small"
                                            icon={<ReloadOutlined />}
                                            loading={!!fullRegeneratingJobs[job.id]}
                                            onClick={() => regenerateFullJob(job)}
                                          >
                                            整篇重新生成
                                          </Button>
                                        )}
                                        <Button size="small" onClick={() => openJobInWorkTab(job.id)}>查看播放與分段</Button>
                                        {isAdmin && (
                                          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteJob(job)}>
                                            刪除
                                          </Button>
                                        )}
                                      </Space>
                                    </Flex>
                                  </div>
                                )}
                                {job.status === 'failed' && (
                                  <Flex justify="flex-end" gap={8} wrap className="job-row-actions">
                                    <Button
                                      size="small"
                                      type="primary"
                                      icon={<ReloadOutlined />}
                                      loading={!!retryingJobs[job.id]}
                                      onClick={() => retryJob(job)}
                                    >
                                      重新執行
                                    </Button>
                                    {isAdmin && (
                                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteJob(job)}>
                                        刪除失敗工作
                                      </Button>
                                    )}
                                  </Flex>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                      {jobsHasMore && (
                        <Flex justify="center">
                          <Button loading={loadingJobs} onClick={() => loadJobs({ append: true })}>
                            載入更多工作
                          </Button>
                        </Flex>
                      )}
                    </Space>
                  )}
                </Card>
              </Space>
            </div>
        </Content>

        <Footer style={{ textAlign: 'center', color: '#66728a' }}>
          Private local tool for VoxCPM Taiwanese Hokkien voice/video generation.
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
