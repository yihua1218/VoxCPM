import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
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

type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

interface Job {
  id: string;
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
  translation_memory?: string;
  pipeline: string[];
}

interface AdminSettings {
  default_reference_voice_mode: 'default' | 'random';
  public_rate_limit_seconds: number;
  api_access_token: string;
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

const defaultChineseText = `今天我想把一段中文稿，翻譯成比較自然的台語稿。
接著使用 VoxCPM 產生語音，再把音訊波形、字幕和聲音合成一支影片。
這個工具會把每一次工作排進佇背景執行，完成以後就可以下載音訊、影片和稿件。`;

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

function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, SegmentReviewPayload>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const signedIn = !!auth?.authenticated;
  const jobDisplayTitle = (job: Job) => firstSentence(job.chinese_text) || job.title;

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

  const loadAdminSettings = async () => {
    if (!auth?.authenticated) return;
    const res = await axios.get<AdminSettings>('/admin/settings');
    setAdminSettings(res.data);
  };

  const loadSegments = async (jobId: string) => {
    const res = await axios.get<{ segments: Segment[] }>(`/jobs/${jobId}/segments`);
    const nextSegments = res.data.segments;
    setSegments(nextSegments);
    setFeedbackDrafts((current) => {
      const next = { ...current };
      for (const segment of nextSegments) {
        if (!next[segment.index]) {
          next[segment.index] = {
            rating: segment.rating ?? 0,
            note: '',
            corrected_taigi_text: inlineText(segment.corrected_taigi_text ?? segment.taigi_text),
            corrected_tailo_text: inlineText(segment.corrected_tailo_text ?? segment.tailo_text),
            corrections: [{ source_phrase: '', taigi_correction: '', tailo_correction: '', note: '' }],
          };
        }
      }
      return next;
    });
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
          setAuth({ authenticated: false, token_required: true, loopback_only: false });
          message.error('登入連結無效或已過期');
        });
    } else {
      loadAuth().catch(() => {
        setAuth({ authenticated: false, token_required: true, loopback_only: false });
      });
    }
    loadInfo().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (auth === null) return;
    loadJobs();
    const timer = window.setInterval(loadJobs, 2500);
    return () => window.clearInterval(timer);
  }, [auth?.authenticated, auth !== null]);

  useEffect(() => {
    loadAdminSettings().catch(() => undefined);
  }, [auth?.authenticated]);

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== 'complete') {
      setSegments([]);
      return;
    }
    loadSegments(selectedJob.id).catch(() => setSegments([]));
  }, [selectedJob?.id, selectedJob?.status]);

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

  const startJob = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const res = await axios.post<Job>('/jobs', values, { timeout: 60000 });
      setSelectedJobId(res.data.id);
      await loadJobs();
      message.success('工作已排入佇背景執行');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '建立工作失敗');
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
      message.success('已儲存評分與修正，下一次翻譯會納入參考');
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      message.error(detail || '儲存失敗');
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
          <Flex align="center" gap={12}>
            <AudioOutlined style={{ fontSize: 24, color: '#0071e3' }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>Taigi Voice Video Web</Title>
              <Text type="secondary">中文稿 → 台語稿 → 語音 → 字幕波形影片</Text>
            </div>
          </Flex>
          <Space>
            {signedIn ? (
              <>
                <Tag color="success">Admin</Tag>
                <Button icon={<ReloadOutlined />} onClick={loadJobs} loading={loadingJobs}>Refresh</Button>
                <Button icon={<LogoutOutlined />} onClick={logout}>Sign out</Button>
              </>
            ) : (
              <Tag color="blue">Public</Tag>
            )}
          </Space>
        </Header>

        <Content className="app-content">
            <div className="app-grid">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card>
                  <div className="card-title">
                    <Title level={3}>建立台語語音影片工作</Title>
                    <Paragraph type="secondary">
                      輸入中文稿後，系統會先產生台語草稿與台羅輔助稿，再分段生成語音並輸出字幕影片。台語草稿欄可直接覆寫，適合人工校稿後再送出。
                    </Paragraph>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="工作流程"
                    description={<PipelineStrip />}
                  />
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
                      control: '闽南话，台湾口音，语气自然，语速正常，保持参考音频的男声音色和说话方式',
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
                      <TextArea rows={7} className="textarea-mono" />
                    </Form.Item>
                    <Form.Item label="台語稿覆寫（可留空，系統會先自動翻成草稿）" name="taigi_override">
                      <TextArea rows={5} className="textarea-mono" placeholder="人工校稿後的台語稿可貼佇遮" />
                    </Form.Item>
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
                        <Input />
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
                      <Form.Item name="copy_to_onedrive" valuePropName="checked">
                        <Checkbox>複製到 OneDrive</Checkbox>
                      </Form.Item>
                    </Flex>
                    <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submitting}>
                      排入工作
                    </Button>
                  </Form>
                </Card>

                <Card>
                  <Flex align="center" justify="space-between" gap={12} className="card-title">
                    <Title level={3} style={{ margin: 0 }}>目前選取</Title>
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
                        </Text>
                      </div>
                      <Progress percent={selectedJob.progress} status={selectedJob.status === 'failed' ? 'exception' : undefined} />
                      <PipelineStrip job={selectedJob} />
                      <Text type={selectedJob.status === 'failed' ? 'danger' : 'secondary'}>
                        {selectedJob.error || selectedJob.stage}
                      </Text>
                      {selectedJob.taigi_text && (
                        <Input.TextArea value={selectedJob.taigi_text} rows={5} readOnly className="textarea-mono" />
                      )}
                      {selectedJob.onedrive_dir && (
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
                            {signedIn && (
                              <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                                刪除
                              </Button>
                            )}
                          </div>
                          <Divider />
                          <Title level={4} style={{ margin: 0 }}>分段檢視與修正</Title>
                          {segments.length === 0 ? (
                            <Alert type="info" showIcon message="尚未載入分段資料" />
                          ) : (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                              {segments.map((segment) => {
                                const draft = feedbackDrafts[segment.index];
                                return (
                                  <div key={segment.index} className="segment-card">
                                    <Flex align="center" justify="space-between" gap={12} wrap>
                                      <Space>
                                        <Tag color="blue">Segment {segment.index}</Tag>
                                        {segment.duration && <Text type="secondary">{segment.duration.toFixed(2)}s</Text>}
                                        {!!segment.feedback_count && <Tag color="success">已回饋 {segment.feedback_count}</Tag>}
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
                      {signedIn && selectedJob.status === 'failed' && (
                        <Button danger icon={<DeleteOutlined />} onClick={() => deleteJob(selectedJob)}>
                          刪除失敗工作
                        </Button>
                      )}
                    </Space>
                  )}
                </Card>
              </Space>

              <Card>
                <Flex align="center" justify="space-between" className="card-title">
                  <Title level={3} style={{ margin: 0 }}>Jobs</Title>
                  <Text type="secondary">{jobs.length} retained</Text>
                </Flex>
                {jobs.length === 0 ? (
                  <Alert type="info" showIcon message="目前無保留工作" />
                ) : (
                  jobs.map((job) => (
                    <button
                      key={job.id}
                      className={`job-row ${selectedJob?.id === job.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className="job-row-name">
                        <Text strong ellipsis>{jobDisplayTitle(job)}</Text>
                        <Tag color={statusColor[job.status]}>{job.status}</Tag>
                      </div>
                      <Progress percent={job.progress} size="small" showInfo={false} />
                      <PipelineStrip job={job} compact />
                      <Text type="secondary">
                        {job.stage} · {formatTime(job.updated_at)}
                        {formatDuration(job.elapsed_seconds) ? ` · 耗時 ${formatDuration(job.elapsed_seconds)}` : ''}
                      </Text>
                    </button>
                  ))
                )}
              </Card>
            </div>
          )}
        </Content>

        <Footer style={{ textAlign: 'center', color: '#6e6e73' }}>
          Private local tool for VoxCPM Taiwanese Hokkien voice/video generation.
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
