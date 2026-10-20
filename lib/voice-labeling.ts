export const voiceHeaders = [
  '原声类型',
  '原声正文',
  '帖子标题',
  '作者昵称',
  '作者稳定标识',
  '原声发布时间（北京时间）',
  '原声点赞数',
  '采集时间（北京时间）',
  '命中关键词',
  '帖子相关性',
  '当前原声相关性',
  '当前原声相关性依据',
  '采集时近7天发布',
  '上下文状态',
  '是否楼主',
  '帖子背景',
  '回复上下文',
  '帖子收藏数',
  '帖子显示评论数',
  '帖子分享数',
  '原声ID',
  '帖子ID',
  '评论ID',
  '根评论ID',
  '直接回复ID',
  '来源链接',
];
export const labelHeaders = [
  '标签行ID',
  '诉求片段',
  'AI诉求ID',
  'AI诉求名称',
  'AI一级Feature',
  'AI二级Feature',
  'AI建议/问题',
  'AI体验/质量',
  '文字匹配分',
  '语义置信度',
  '一级Feature置信度',
  '二级Feature置信度',
  '建议/问题置信度',
  '体验/质量置信度',
  '综合置信度',
  '置信等级',
  'AI匹配状态',
  '匹配依据',
  '引用证据',
  '第二候选ID',
  '候选差距',
  '风险标记',
  '命中纠错样本',
  '字典版本',
  '规则版本',
  '审核状态',
  '人工诉求ID',
  '人工诉求名称',
  '人工一级Feature',
  '人工二级Feature',
  '人工建议/问题',
  '人工体验/质量',
  '人工匹配状态',
  '审核人',
  '审核备注',
];
export const screenHeaders = [
  'AI相关性',
  'AI诉求性',
  '相关性置信度',
  '筛选依据',
  '筛选证据',
  '字典版本',
  '规则版本',
  '审核状态',
  '人工相关性',
  '人工诉求性',
  '审核人',
  '审核备注',
];
export const matchStates = [
  '匹配已有诉求',
  '待新增诉求',
  '待确认',
  '不匹配',
  '无诉求',
];
export const relevanceStates = ['相关', '不相关', '待确认'];
export type LabelValue = Record<string, any>;
export type VoiceLabel = {
  id: string;
  feedback_id: string;
  intent_id: string;
  fragment: string;
  ai: LabelValue;
  final: LabelValue;
  source: string;
  confidence: number | null;
  text_score: number | null;
  review_status: string;
  reviewer: string;
  note: string;
  revision: number;
  catalog_version: string;
  rule_version: string;
};
export type VoiceScreen = {
  id: string;
  voice_id: string;
  raw: any[];
  ai: LabelValue;
  final: LabelValue;
  relevance: string;
  demandness: string;
  confidence: number | null;
  review_status: string;
  reviewer: string;
  note: string;
  revision: number;
  catalog_version: string;
  rule_version: string;
};
export function parseObject(value: string | undefined, fallback: any = {}) {
  try {
    return JSON.parse(value || '') ?? fallback;
  } catch {
    return fallback;
  }
}
export function aiFinal(ai: LabelValue) {
  return Object.fromEntries(
    [
      '诉求ID',
      '诉求名称',
      '一级Feature',
      '二级Feature',
      '建议/问题',
      '体验/质量',
      '匹配状态',
    ].map((k) => [k, ai['AI' + k] || '']),
  );
}
export function excludedScreen(s: {
  relevance: string;
  demandness?: string;
  confidence: number | null;
  review_status: string;
}) {
  return (
    (s.relevance === '不相关' || s.demandness === '无诉求') &&
    (s.review_status !== '待审核' || (s.confidence ?? 0) >= 95)
  );
}
export function confidenceFromAI(
  ai: LabelValue,
  relevance: number | null,
  contextStatus: string,
) {
  const names = [
    '语义置信度',
    '一级Feature置信度',
    '二级Feature置信度',
    '建议/问题置信度',
    '体验/质量置信度',
  ];
  const scores = names.map((k) => ai[k]);
  if (
    relevance === null ||
    scores.some(
      (v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100,
    )
  )
    return null;
  let total = Math.round(
    scores.reduce((n, v, i) => n + v * [0.5, 0.15, 0.15, 0.1, 0.1][i], 0),
  );
  total = Math.min(total, relevance ?? 0, ...scores.slice(1));
  const risks = String(ai['风险标记'] || '');
  if (
    contextStatus === '部分缺失' ||
    risks ||
    ai['AI匹配状态'] !== '匹配已有诉求' ||
    Number(ai['候选差距'] ?? 0) < 10
  )
    total = Math.min(total, 79);
  return total;
}
export function sourceFromVoice(id: string) {
  return (
    (
      {
        xhs: '小红书',
        wb: '微博',
        dy: '抖音',
        bili: 'B站',
        ks: '快手',
        tieba: '百度贴吧',
        zhihu: '知乎',
      } as Record<string, string>
    )[id.split(':')[0]] || '未注明'
  );
}
export function recordFromRaw(raw: any[]) {
  if (raw.length !== 26 || !raw[1] || !raw[20])
    throw new Error('原声必须包含完整26列、正文与原声ID');
  const wall = (v: any) =>
    String(v || '')
      .replace('T', ' ')
      .replace(/(?:Z|[+-]\d\d:\d\d)$/, '')
      .replace(/\.\d+$/, '');
  const metric = (v: any) =>
    v === null || v === undefined || v === '' ? null : Number(v);
  return {
    raw: raw[1],
    source: sourceFromVoice(String(raw[20])),
    source_type: raw[0] === '帖子' ? '帖子' : '评论',
    external_id: raw[22] || raw[21] || String(raw[20]),
    post_id: raw[21] || '',
    parent_comment_id: raw[24] || '',
    crawl_keyword: raw[8] || '',
    published_at: wall(raw[5]),
    captured_at: wall(raw[7]),
    like_count: metric(raw[6]),
    collect_count: metric(raw[17]),
    comment_count: metric(raw[18]),
    share_count: metric(raw[19]),
    url: raw[25] || '',
  };
}
