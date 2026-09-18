// 所有枚举的中文映射和配色都集中在这里，改文案只改这一处。

const TONE = {
  gray: 'gray',
  blue: 'blue',
  green: 'green',
  amber: 'amber',
  red: 'red',
  purple: 'purple',
}

export const PROJECT_STATUS = {
  idea: { label: '想法', tone: TONE.gray },
  planning: { label: '规划中', tone: TONE.purple },
  active: { label: '进行中', tone: TONE.blue },
  paused: { label: '暂停', tone: TONE.amber },
  done: { label: '已完成', tone: TONE.green },
}
export const PROJECT_STATUS_ORDER = ['idea', 'planning', 'active', 'paused', 'done']

export const PRIORITY = {
  high: { label: '高', tone: TONE.red, symbol: '↑' },
  medium: { label: '中', tone: TONE.amber, symbol: '—' },
  low: { label: '低', tone: TONE.gray, symbol: '↓' },
}
export const PRIORITY_ORDER = ['high', 'medium', 'low']

export const TASK_STATUS = {
  todo: { label: '待开始', tone: TONE.gray },
  doing: { label: '进行中', tone: TONE.blue },
  review: { label: '待复查', tone: TONE.purple },
  done: { label: '已完成', tone: TONE.green },
}
export const TASK_STATUS_ORDER = ['todo', 'doing', 'review', 'done']

export const KNOWLEDGE_STATUS = {
  notStarted: { label: '未开始', tone: TONE.gray },
  learning: { label: '学习中', tone: TONE.amber },
  mastered: { label: '已掌握', tone: TONE.green },
}
export const KNOWLEDGE_STATUS_ORDER = ['notStarted', 'learning', 'mastered']

export const AGENT_TYPE = {
  web: { label: '网页', tone: TONE.blue, icon: '🌐' },
  desktop: { label: '桌面应用', tone: TONE.green, icon: '🖥️' },
  command: { label: '命令行', tone: TONE.purple, icon: '⌨️' },
}
export const AGENT_TYPE_ORDER = ['web', 'desktop', 'command']

export const AGENT_CATEGORIES = ['对话', '编程', '绘图', '其他']

export const KNOWLEDGE_CATEGORIES = ['编程', '设计', '研究', 'AI工具', '写作', '其他']

export const RESOURCE_TYPE = {
  doc: { label: '项目文档', icon: '📄' },
  asset: { label: '素材文件', icon: '🎨' },
  reference: { label: '参考资料', icon: '🔗' },
  retro: { label: '复盘记录', icon: '📝' },
}
export const RESOURCE_TYPE_ORDER = ['doc', 'asset', 'reference', 'retro']

export const DEFAULT_CATEGORIES = ['课程作业', '编程开发', '论文与研究']

export const COVER_COLORS = [
  '#4A6FA5',
  '#5A9367',
  '#7E6BAA',
  '#C99A3E',
  '#C4574C',
  '#3E8E8E',
  '#A0603E',
  '#6B7A8F',
]

export const AGENT_ICONS = [
  '🤖', '✳️', '🧠', '💬', '🖥️', '⌨️', '🎨', '📝', '🔍', '📊',
  '🧪', '⚡', '🛠️', '📚', '🎬', '🖌️', '🐍', '☕', '🦀', '🧩',
]

export const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function toneOf(map, key, fallback = 'gray') {
  return map[key]?.tone || fallback
}

export function labelOf(map, key, fallback = '未知') {
  return map[key]?.label || fallback
}
