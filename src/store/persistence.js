import { DEFAULT_CATEGORIES } from '../data/options.js'
import { nowISO } from '../domain/dates.js'

// 浏览器里存的是「镜像」，磁盘上的 JSON 文件才是正式副本。
// 镜像的作用是：服务器挂了还能用，以及页面关太快没推上磁盘时留个底。
const STORAGE_KEY = 'aiwb:data:v1'
const META_KEY = 'aiwb:meta:v1'
const AI_BANNER_KEY = 'aiwb:ai-banner-dismissed:v1'
export const SCHEMA_VERSION = 1

const ARRAY_KEYS = [
  'projects',
  'tasks',
  'knowledgeConcepts',
  'projectKnowledge',
  'agents',
  'promptTemplates',
  'resources',
]

export const EMPTY_STATE = {
  schemaVersion: SCHEMA_VERSION,
  // 每次改动 +1。用来判断镜像和磁盘谁更新，以及挡住旧标签页的覆盖写入。
  revision: 0,
  projects: [],
  tasks: [],
  knowledgeConcepts: [],
  projectKnowledge: [],
  agents: [],
  promptTemplates: [],
  resources: [],
  settings: {
    theme: 'system',
    categories: [...DEFAULT_CATEGORIES],
    manualProgressDefault: false,
  },
}

// 早期的扁平 knowledgeItems 升格成「概念 + 关联」两张表
function upgradeFlatKnowledge(state, flatItems) {
  const concepts = []
  const relations = []

  for (const item of flatItems) {
    const conceptId = `kc_${item.id}`
    const links = Array.isArray(item.resourceLinks) ? item.resourceLinks : []
    concepts.push({
      id: conceptId,
      name: item.title || '未命名知识点',
      category: item.category || '其他',
      description: '',
      defaultResources: links,
      createdAt: item.createdAt || nowISO(),
      updatedAt: item.updatedAt || nowISO(),
    })
    relations.push({
      id: `pk_${item.id}`,
      conceptId,
      projectId: item.projectId,
      reasonNeeded: item.reasonNeeded || '',
      status: item.status || 'notStarted',
      estimatedMinutes: item.estimatedMinutes ?? null,
      resourceLinks: [],
      blocksProject: Boolean(item.blocksProject),
      notes: item.notes || '',
      createdAt: item.createdAt || nowISO(),
      updatedAt: item.updatedAt || nowISO(),
    })
  }

  return { ...state, knowledgeConcepts: concepts, projectKnowledge: relations }
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('数据格式不对，顶层应该是一个对象')
  }

  let state = {
    ...EMPTY_STATE,
    ...raw,
    settings: { ...EMPTY_STATE.settings, ...(raw.settings || {}) },
  }

  if (
    Array.isArray(raw.knowledgeItems) &&
    raw.knowledgeItems.length > 0 &&
    (!Array.isArray(raw.knowledgeConcepts) || raw.knowledgeConcepts.length === 0)
  ) {
    state = upgradeFlatKnowledge(state, raw.knowledgeItems)
  }
  delete state.knowledgeItems

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(state[key])) state[key] = []
  }
  if (!Array.isArray(state.settings.categories) || state.settings.categories.length === 0) {
    state.settings.categories = [...DEFAULT_CATEGORIES]
  }

  // stepTaskId：这个知识点服务于路线上的哪一步。老数据没有，补成 null（还没安排）。
  // 归属存在知识点这一侧、而且是单个 id —— 一个知识点只跟一步走，
  // 由数据结构本身保证，不靠约定。
  state.projectKnowledge = state.projectKnowledge.map((rel) =>
    'stepTaskId' in rel ? rel : { ...rel, stepTaskId: null },
  )

  // 顺手做两件事，都是换新对象、不原地改传进来的数据：
  //   1. 抹掉 task.knowledgeIds —— 同日短暂用过的旧设计（数组版归属），
  //      已经换成上面那个 stepTaskId。你那份数据里它是空的，没有损失。
  //   2. 补上 doneWhen（做到什么算完成）—— 后加的字段，老任务没有。
  state.tasks = state.tasks.map((task) => {
    const { knowledgeIds, ...rest } = task
    return 'doneWhen' in rest ? rest : { ...rest, doneWhen: '' }
  })

  state.schemaVersion = SCHEMA_VERSION
  state.revision = Number(state.revision) || 0
  return state
}

export function readMirror() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeState(JSON.parse(raw))
  } catch (err) {
    console.warn('[workbench] 本地镜像读取失败', err)
    return null
  }
}

export function writeMirror(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearMirror() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(META_KEY)
}

const EMPTY_META = { syncedRevision: 0, lastSaveAt: null, lastSaveError: null }

// 记录「最后一次确认写进磁盘的是第几版」。镜像里的 revision 比它大，
// 就说明有改动没落到磁盘上，下次启动要问一句。
export function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { ...EMPTY_META }
    return { ...EMPTY_META, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY_META }
  }
}

export function writeMeta(patch) {
  const next = { ...readMeta(), ...patch }
  localStorage.setItem(META_KEY, JSON.stringify(next))
  return next
}

// 「还没接 AI」那条引导横幅被关掉过没有。
// 不配 key 应用照样能用（四条 AI 路径都回退模拟数据），所以关掉是合理选择。
export function readAiBannerDismissed() {
  try {
    return localStorage.getItem(AI_BANNER_KEY) === '1'
  } catch {
    return false
  }
}

export function writeAiBannerDismissed(dismissed) {
  try {
    if (dismissed) localStorage.setItem(AI_BANNER_KEY, '1')
    else localStorage.removeItem(AI_BANNER_KEY)
  } catch {
    // 隐私模式下写不进去，那就只对这次会话有效，不值得报错
  }
}

export function exportPayload(state) {
  return {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    app: 'ai-workbench',
  }
}

export function summarize(state) {
  return {
    projects: state.projects.length,
    tasks: state.tasks.length,
    concepts: state.knowledgeConcepts.length,
    relations: state.projectKnowledge.length,
    agents: state.agents.length,
    templates: state.promptTemplates.length,
    resources: state.resources.length,
  }
}

export function parseImport(json) {
  let parsed
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    throw new Error('不是合法的 JSON 文件')
  }
  return normalizeState(parsed)
}
