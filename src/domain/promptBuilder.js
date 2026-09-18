import { KNOWLEDGE_STATUS, PRIORITY, PROJECT_STATUS } from '../data/options.js'
import { formatDate } from './dates.js'
import { isBlockingRelation, knowledgeGapsForProject } from './knowledge.js'
import { computeProgress } from './progress.js'

// 缺失的字段一律显式写出来，不用编内容填满。让 AI 自己知道该追问什么。
export const PENDING = '（待补充）'

export const PROJECT_PROMPT_TEMPLATE = `你现在是我的 AI 项目协作助手。

项目名称：{{projectName}}
项目类型：{{category}}
项目目标：{{description}}
当前阶段：{{projectStatus}}
项目进度：{{progress}}%
当前下一步行动：{{nextAction}}

当前任务：
{{taskList}}

我需要补足的知识点：
{{knowledgeGaps}}

可使用的工具或限制：
{{constraints}}

请你：
1. 先判断当前最应该推进的一项工作；
2. 将它拆成可直接执行的小步骤；
3. 说明我需要先学习的知识点，按重要程度排序；
4. 对不确定的信息明确标记，不要自行编造；
5. 输出结果时使用“下一步行动、需要的知识、可直接复制的执行指令”三个部分。`

export function extractVariables(content) {
  const names = []
  const re = /\{\{\s*([^{}\s]+)\s*\}\}/g
  let m
  while ((m = re.exec(String(content || '')))) {
    if (!names.includes(m[1])) names.push(m[1])
  }
  return names
}

export function fillTemplate(content, vars) {
  return String(content || '').replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (full, key) => {
    const v = vars[key]
    if (v === undefined || v === null || v === '') return PENDING
    return String(v)
  })
}

function orPending(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : PENDING
}

const TASK_ORDER = { doing: 0, todo: 1, review: 2, done: 3 }

function formatTaskList(tasks) {
  const pending = tasks
    .filter((t) => t.status !== 'done')
    .sort(
      (a, b) =>
        TASK_ORDER[a.status] - TASK_ORDER[b.status] || (a.order ?? 0) - (b.order ?? 0),
    )

  if (pending.length === 0) return '（暂无任务）'

  return pending
    .map((t) => {
      const bits = []
      if (t.dueDate) bits.push(`截止 ${formatDate(t.dueDate)}`)
      if (t.estimatedHours) bits.push(`预计 ${t.estimatedHours}h`)
      const tail = bits.length ? `（${bits.join('，')}）` : ''
      return `- [${PRIORITY[t.priority]?.label || '中'}] ${t.title}${tail}`
    })
    .join('\n')
}

function formatKnowledgeGaps(items) {
  if (items.length === 0) return '（暂无）'
  return items
    .map((k) => {
      const bits = [KNOWLEDGE_STATUS[k.status]?.label || '未开始']
      if (k.estimatedMinutes) bits.push(`预计 ${k.estimatedMinutes} 分钟`)
      if (isBlockingRelation(k)) bits.push('阻塞当前任务')
      return `- ${k.concept.name}（${bits.join('，')}）`
    })
    .join('\n')
}

export function buildPromptVariables({ project, tasks, projectKnowledge, concepts }) {
  const myTasks = tasks.filter((t) => t.projectId === project.id)
  const gaps = knowledgeGapsForProject(project.id, projectKnowledge, concepts)

  return {
    projectName: orPending(project.name),
    category: orPending(project.category),
    description: orPending(project.description),
    projectStatus: PROJECT_STATUS[project.status]?.label || PENDING,
    progress: computeProgress(project, tasks),
    nextAction: orPending(project.nextAction),
    taskList: formatTaskList(myTasks),
    knowledgeGaps: formatKnowledgeGaps(gaps),
    constraints:
      Array.isArray(project.constraints) && project.constraints.length > 0
        ? project.constraints.join('\n')
        : PENDING,
  }
}

export function buildProjectPrompt(ctx) {
  const vars = buildPromptVariables(ctx)
  return { text: fillTemplate(PROJECT_PROMPT_TEMPLATE, vars), vars }
}
