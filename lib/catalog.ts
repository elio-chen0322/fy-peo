export const featureSeed: Record<string, string[]> = {
  人工智能与情感体验: [
    '语音唤醒与识别',
    '语音车控',
    '连续对话与上下文',
    'AI问答',
    '形象与个性化互动',
  ],
  '地图出行 & LBS体验': [
    '地点搜索',
    '路线规划',
    '导航引导',
    '实时路况',
    '充换电地点与推荐',
    '收藏与地址同步',
  ],
  '媒体娱乐&生态应用体验': [
    'QQ音乐（CN）',
    '喜马拉雅',
    '视频应用',
    '蓝牙音乐',
    '音源切换',
    '应用登录与会员',
  ],
  系统与车控体验: [
    '系统流畅性与稳定性',
    '账号与偏好记忆',
    '通知中心',
    'OTA升级',
    '快捷车控',
    '数据隐私设置',
  ],
  场景模式体验: [
    '宠物模式',
    '洗车模式',
    '离车不下电',
    '小憩/呼吸/冥想',
    '场景进入与退出',
    '跨功能联动',
  ],
  界面与交互体验: [
    '桌面与布局',
    '菜单层级',
    '文字与图标',
    '弹窗与提示',
    '操作反馈',
    '多任务与窗口',
  ],
  HMI体验: [
    '方向盘按键',
    '中控与实体按键',
    '仪表信息',
    '系统提示音',
    '屏幕亮度与可读性',
  ],
  智能硬件体验: [
    '5G/LTE/卫星通信',
    '车机Wi-Fi与热点',
    '蓝牙连接',
    '麦克风与拾音',
    '摄像头与影像显示',
    '音响与声音表现',
  ],
  空调与座椅交互体验: [
    '温度与风量设置',
    '空调自动控制',
    '空调分区',
    '座椅调节与记忆',
    '轻松进出',
    '座椅舒适功能控制',
  ],
  手机App与车端协同体验: [
    '远程车控',
    '车辆状态刷新',
    '数字钥匙',
    '通知同步',
    '地址发送',
    '连接与同步稳定性',
  ],
};
export const kinds = ['体验', '质量', '待判断', '不适用'];
export const expressionTypes = ['问题', '抱怨', '建议', '认可', '咨询', '分享/描述', '待判断'];
export const statuses = ['待审核', '已确认'];
export const types = ['帖子', '评论', '其他'];
export const fieldLabels: Record<string, string> = {
  raw: '反馈原声',
  request_id: '用户诉求',
  theme_id: '用户声音主题',
  theme_confidence: '主题推荐匹配度',
  theme_reason: '主题匹配依据',
  feature_id: 'Feature',
  kind: '体验/质量',
  expression_type: '表达类型',
  expression_reason: '表达类型判断依据',
  version: '版本',
  published_at: '发帖/评论时间',
  url: '链接',
  attachment_links: '附件链接',
  city: 'IP城市',
  status: '审核状态',
  source: '来源',
  source_type: '内容类型',
  external_id: '来源编号',
  post_id: '所属帖子ID',
  parent_comment_id: '父评论ID',
  crawl_keyword: '采集关键词',
  captured_at: '采集时间',
  like_count: '点赞数',
  comment_count: '帖子评论数',
  collect_count: '收藏数',
  share_count: '分享数',
  reply_count: '评论回复数',
  archived: '归档状态',
};
export type Feature = {
  id: string;
  parent: string;
  name: string;
  count?: number;
};
export type Demand = {
  id: string;
  name: string;
  count: number;
  ao: string;
  source_id: string;
  uba: string;
  attribute: string;
  request_type: string;
  hardware_software: string;
  feature1: string;
  feature1_source_id: string;
  feature2: string;
  feature2_source_id: string;
  lifecycle_status: string;
  source_url: string;
};
export type Theme = {
  id: string;
  feature_id: string;
  name: string;
  description: string;
  keywords: string;
  active: number;
  count: number;
};
export type Feedback = {
  id: string;
  raw: string;
  request_id: string;
  request_candidate_id: string;
  request_candidate_score: number;
  request_candidate_reason: string;
  request_match_score: number;
  request_match_status: string;
  theme_id: string;
  theme_confidence: number;
  theme_reason: string;
  theme_name: string;
  post_context?: string;
  parent_context?: string;
  feature_id: string;
  kind: string;
  expression_type: string;
  expression_reason: string;
  version: string;
  published_at: string;
  url: string;
  attachment_links: string;
  city: string;
  status: string;
  source: string;
  source_type: string;
  external_id: string;
  post_id: string;
  parent_comment_id: string;
  crawl_keyword: string;
  captured_at: string;
  like_count: number | null;
  comment_count: number | null;
  collect_count: number | null;
  share_count: number | null;
  reply_count: number | null;
  archived: number;
  revision: number;
  request_name: string;
  request_uba?: string;
  request_attribute?: string;
  request_type?: string;
  request_hardware_software?: string;
  request_feature1?: string;
  request_feature2?: string;
  request_candidate_name: string;
  candidate_uba?: string;
  candidate_attribute?: string;
  candidate_request_type?: string;
  candidate_hardware_software?: string;
  candidate_feature1?: string;
  candidate_feature2?: string;
  feature1: string;
  feature2: string;
  created_at: string;
  updated_at: string;
  file_count: number;
  original_snapshot?: string;
};
export type InputRecord = Partial<Feedback> & {
  analysis_context?: string;
  request_name?: string;
  feature1?: string;
  feature2?: string;
};
export const emptyRecord = (): InputRecord => ({
  raw: '',
  request_id: '',
  request_candidate_id: '',
  request_candidate_score: 0,
  request_candidate_reason: '',
  request_match_score: 0,
  request_match_status: '未匹配',
  theme_id: '',
  theme_confidence: 0,
  theme_reason: '',
  theme_name: '',
  request_name: '',
  feature_id: '',
  feature1: '',
  feature2: '',
  kind: '待判断',
  expression_type: '待判断',
  expression_reason: '',
  version: '',
  published_at: '',
  url: '',
  attachment_links: '',
  city: '',
  status: '待审核',
  source: '小红书',
  source_type: '帖子',
  external_id: '',
  post_id: '',
  parent_comment_id: '',
  crawl_keyword: '',
  captured_at: '',
  like_count: null,
  comment_count: null,
  collect_count: null,
  share_count: null,
  reply_count: null,
});
export function validUrl(v: string) {
  try {
    const u = new URL(v);
    return ['https:', 'http:'].includes(u.protocol);
  } catch {
    return false;
  }
}
