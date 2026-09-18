import { nowISO } from '../domain/dates.js'
import { syncProjectProgress } from '../domain/progress.js'

// 进度是从任务算出来的，任何影响任务的改动之后都要重算一遍
function withSyncedProgress(state) {
  return {
    ...state,
    projects: state.projects.map((p) => syncProjectProgress(p, state.tasks)),
  }
}

function touch(entity) {
  return { ...entity, updatedAt: nowISO() }
}

function replace(list, id, patch) {
  return list.map((item) => (item.id === id ? touch({ ...item, ...patch }) : item))
}

// 每次真正改变状态就把 revision 加一，用来判断镜像和磁盘谁更新。
// DATA_REPLACE 是采纳外部来的状态，保留它自己的版本号 ——
// 否则刚从磁盘加载完就会被当成新改动，立刻又写回去一遍。
export function reducer(state, action) {
  const next = baseReducer(state, action)
  if (next === state) return state
  if (action.type === 'DATA_REPLACE') {
    return { ...next, revision: Number(next.revision) || 0 }
  }
  return {
    ...next,
    revision: (Number(state.revision) || 0) + 1,
    updatedAt: nowISO(),
  }
}

function baseReducer(state, action) {
  switch (action.type) {
    /* ---------- 项目 ---------- */

    case 'PROJECT_CREATE':
      return withSyncedProgress({
        ...state,
        projects: [...state.projects, action.project],
      })

    case 'PROJECT_UPDATE':
      return withSyncedProgress({
        ...state,
        projects: replace(state.projects, action.id, action.patch),
      })

    case 'PROJECT_ARCHIVE':
      return {
        ...state,
        projects: replace(state.projects, action.id, { archived: action.archived }),
      }

    case 'PROJECT_DELETE':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        // 级联删任务和关联，概念本体保留
        tasks: state.tasks.filter((t) => t.projectId !== action.id),
        projectKnowledge: state.projectKnowledge.filter((k) => k.projectId !== action.id),
        resources: state.resources.filter((r) => r.projectId !== action.id),
        promptTemplates: state.promptTemplates.filter((t) => t.projectId !== action.id),
        agents: state.agents.map((a) =>
          a.projectIds?.includes(action.id)
            ? { ...a, projectIds: a.projectIds.filter((id) => id !== action.id) }
            : a,
        ),
      }

    /* ---------- 任务 ---------- */

    case 'TASK_CREATE':
      return withSyncedProgress({ ...state, tasks: [...state.tasks, action.task] })

    case 'TASK_UPDATE':
      return withSyncedProgress({
        ...state,
        tasks: replace(state.tasks, action.id, action.patch),
      })

    case 'TASK_DELETE':
      return withSyncedProgress({
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
      })

    case 'TASK_MOVE': {
      const { id, status, index } = action
      const task = state.tasks.find((t) => t.id === id)
      if (!task) return state

      const column = state.tasks
        .filter((t) => t.id !== id && t.projectId === task.projectId && t.status === status)
        .sort((a, b) => a.order - b.order)

      const moved = {
        ...task,
        status,
        updatedAt: nowISO(),
        completedAt: status === 'done' ? task.completedAt || nowISO() : null,
      }

      const at = Math.max(0, Math.min(index ?? column.length, column.length))
      column.splice(at, 0, moved)

      // 整列重排，步长 1000 留出中间插入的余地
      const reordered = new Map(
        column.map((t, i) => [t.id, { ...t, order: (i + 1) * 1000 }]),
      )

      return withSyncedProgress({
        ...state,
        tasks: state.tasks.map((t) => reordered.get(t.id) || t),
      })
    }

    /* ---------- 知识点：概念层 ---------- */

    case 'CONCEPT_CREATE':
      return { ...state, knowledgeConcepts: [...state.knowledgeConcepts, action.concept] }

    case 'CONCEPT_UPDATE':
      return {
        ...state,
        knowledgeConcepts: replace(state.knowledgeConcepts, action.id, action.patch),
      }

    case 'CONCEPT_DELETE':
      // 有引用时界面已经拦住，这里再做一次兜底
      if (state.projectKnowledge.some((k) => k.conceptId === action.id)) return state
      return {
        ...state,
        knowledgeConcepts: state.knowledgeConcepts.filter((c) => c.id !== action.id),
      }

    /* ---------- 知识点：项目关联层 ---------- */

    case 'RELATION_CREATE':
      return { ...state, projectKnowledge: [...state.projectKnowledge, action.relation] }

    case 'RELATION_UPDATE':
      return {
        ...state,
        projectKnowledge: replace(state.projectKnowledge, action.id, action.patch),
      }

    case 'RELATION_DELETE':
      return {
        ...state,
        projectKnowledge: state.projectKnowledge.filter((k) => k.id !== action.id),
      }

    case 'KNOWLEDGE_BULK_ADD':
      return {
        ...state,
        knowledgeConcepts: [...state.knowledgeConcepts, ...action.concepts],
        projectKnowledge: [...state.projectKnowledge, ...action.relations],
      }

    /* ---------- Agent ---------- */

    case 'AGENT_CREATE':
      return { ...state, agents: [...state.agents, action.agent] }

    case 'AGENT_UPDATE':
      return { ...state, agents: replace(state.agents, action.id, action.patch) }

    case 'AGENT_DELETE':
      return { ...state, agents: state.agents.filter((a) => a.id !== action.id) }

    /* ---------- Prompt 模板 ---------- */

    case 'TEMPLATE_CREATE':
      return { ...state, promptTemplates: [...state.promptTemplates, action.template] }

    case 'TEMPLATE_UPDATE':
      return {
        ...state,
        promptTemplates: replace(state.promptTemplates, action.id, action.patch),
      }

    case 'TEMPLATE_DELETE':
      return {
        ...state,
        promptTemplates: state.promptTemplates.filter((t) => t.id !== action.id),
      }

    /* ---------- 项目资料 ---------- */

    case 'RESOURCE_CREATE':
      return { ...state, resources: [...state.resources, action.resource] }

    case 'RESOURCE_UPDATE':
      return { ...state, resources: replace(state.resources, action.id, action.patch) }

    case 'RESOURCE_DELETE':
      return { ...state, resources: state.resources.filter((r) => r.id !== action.id) }

    /* ---------- 设置与整体数据 ---------- */

    case 'SETTINGS_UPDATE':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'DATA_REPLACE':
      return withSyncedProgress(action.state)

    case 'DATA_IMPORT': {
      const incoming = withSyncedProgress(action.state)
      if (action.mode === 'replace') return incoming

      // 合并：同 id 保留现有，只补新的
      const mergeKey = (key) => {
        const seen = new Set(state[key].map((x) => x.id))
        return [...state[key], ...incoming[key].filter((x) => !seen.has(x.id))]
      }
      return withSyncedProgress({
        ...state,
        projects: mergeKey('projects'),
        tasks: mergeKey('tasks'),
        knowledgeConcepts: mergeKey('knowledgeConcepts'),
        projectKnowledge: mergeKey('projectKnowledge'),
        agents: mergeKey('agents'),
        promptTemplates: mergeKey('promptTemplates'),
        resources: mergeKey('resources'),
        settings: {
          ...state.settings,
          categories: [
            ...new Set([...state.settings.categories, ...incoming.settings.categories]),
          ],
        },
      })
    }

    case 'DATA_RESET':
      return action.state

    default:
      return state
  }
}
