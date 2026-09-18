import { COVER_COLORS } from '../data/options.js'
import { buildSeedData } from '../data/seed.js'
import { normalizeConstraints } from '../domain/constraints.js'
import { nowISO, todayString } from '../domain/dates.js'
import { makeId } from '../domain/id.js'
import { findConceptByName, normalizeName } from '../domain/knowledge.js'
import { EMPTY_STATE, exportPayload, parseImport, summarize } from './persistence.js'

export function createActions(dispatch, getState) {
  const state = () => getState()

  return {
    /* ---------- 项目 ---------- */

    createProject(input = {}) {
      const project = {
        id: makeId('p'),
        name: (input.name || '').trim() || '未命名项目',
        description: input.description || '',
        category: input.category || state().settings.categories[0] || '其他',
        status: input.status || 'idea',
        priority: input.priority || 'medium',
        progress: 0,
        progressMode: input.progressMode || 'auto',
        manualProgress: input.manualProgress ?? 0,
        coverColor: input.coverColor || COVER_COLORS[0],
        startDate: input.startDate || todayString(),
        dueDate: input.dueDate || null,
        nextAction: input.nextAction || '',
        constraints: normalizeConstraints(input.constraints),
        tags: Array.isArray(input.tags) ? input.tags : [],
        relatedLinks: Array.isArray(input.relatedLinks) ? input.relatedLinks : [],
        notes: input.notes || '',
        archived: false,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'PROJECT_CREATE', project })
      return project
    },

    updateProject(id, patch) {
      const next = { ...patch }
      if ('constraints' in next) next.constraints = normalizeConstraints(next.constraints)
      dispatch({ type: 'PROJECT_UPDATE', id, patch: next })
    },

    setProjectArchived(id, archived) {
      dispatch({ type: 'PROJECT_ARCHIVE', id, archived })
    },

    deleteProject(id) {
      dispatch({ type: 'PROJECT_DELETE', id })
    },

    duplicateProject(id) {
      const s = state()
      const src = s.projects.find((p) => p.id === id)
      if (!src) return null

      const copy = {
        ...src,
        id: makeId('p'),
        name: `${src.name} 副本`,
        status: 'idea',
        archived: false,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }

      const tasks = s.tasks
        .filter((t) => t.projectId === id)
        .map((t) => ({ ...t, id: makeId('t'), projectId: copy.id, createdAt: nowISO(), updatedAt: nowISO() }))

      const relations = s.projectKnowledge
        .filter((k) => k.projectId === id)
        .map((k) => ({ ...k, id: makeId('pk'), projectId: copy.id, createdAt: nowISO(), updatedAt: nowISO() }))

      const resources = s.resources
        .filter((r) => r.projectId === id)
        .map((r) => ({ ...r, id: makeId('r'), projectId: copy.id, createdAt: nowISO(), updatedAt: nowISO() }))

      dispatch({
        type: 'DATA_IMPORT',
        mode: 'merge',
        state: {
          ...s,
          projects: [copy],
          tasks,
          projectKnowledge: relations,
          resources,
          knowledgeConcepts: [],
          agents: [],
          promptTemplates: [],
          settings: s.settings,
        },
      })
      return copy
    },

    /* ---------- 任务 ---------- */

    createTask(projectId, input = {}) {
      const siblings = state().tasks.filter(
        (t) => t.projectId === projectId && t.status === (input.status || 'todo'),
      )
      const task = {
        id: makeId('t'),
        projectId,
        title: (input.title || '').trim() || '未命名任务',
        description: input.description || '',
        doneWhen: input.doneWhen || '',
        status: input.status || 'todo',
        priority: input.priority || 'medium',
        dueDate: input.dueDate || null,
        estimatedHours: input.estimatedHours ?? null,
        completedAt: input.status === 'done' ? nowISO() : null,
        order: (siblings.length + 1) * 1000,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'TASK_CREATE', task })
      return task
    },

    updateTask(id, patch) {
      const next = { ...patch }
      if ('status' in next) {
        const current = state().tasks.find((t) => t.id === id)
        next.completedAt =
          next.status === 'done' ? current?.completedAt || nowISO() : null
      }
      dispatch({ type: 'TASK_UPDATE', id, patch: next })
    },

    moveTask(id, status, index) {
      dispatch({ type: 'TASK_MOVE', id, status, index })
    },

    // 删掉这一步之后，挂在它上面的知识点要回到「未安排」，
    // 否则会留下指向已删任务的 stepTaskId —— 路线里看不见，未安排列表里也不出现。
    deleteTask(id) {
      const affected = state().projectKnowledge.filter((k) => k.stepTaskId === id)
      dispatch({ type: 'TASK_DELETE', id })
      for (const rel of affected) {
        dispatch({
          type: 'RELATION_UPDATE',
          id: rel.id,
          patch: { stepTaskId: null, updatedAt: nowISO() },
        })
      }
      return { ok: true, unassigned: affected.length }
    },

    /* ---------- 知识点 ---------- */

    createConcept(input = {}) {
      const concept = {
        id: makeId('kc'),
        name: (input.name || '').trim() || '未命名知识点',
        category: input.category || '其他',
        description: input.description || '',
        defaultResources: Array.isArray(input.defaultResources) ? input.defaultResources : [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'CONCEPT_CREATE', concept })
      return concept
    },

    updateConcept(id, patch) {
      dispatch({ type: 'CONCEPT_UPDATE', id, patch })
    },

    // 有引用时不允许删，这里再挡一次
    deleteConcept(id) {
      if (state().projectKnowledge.some((k) => k.conceptId === id)) {
        return { ok: false, reason: 'HAS_REFERENCES' }
      }
      dispatch({ type: 'CONCEPT_DELETE', id })
      return { ok: true }
    },

    linkConcept(projectId, conceptId, extra = {}) {
      const exists = state().projectKnowledge.some(
        (k) => k.projectId === projectId && k.conceptId === conceptId,
      )
      if (exists) return { ok: false, reason: 'ALREADY_LINKED' }

      const relation = {
        id: makeId('pk'),
        conceptId,
        projectId,
        reasonNeeded: extra.reasonNeeded || '',
        status: extra.status || 'notStarted',
        estimatedMinutes: extra.estimatedMinutes ?? null,
        resourceLinks: Array.isArray(extra.resourceLinks) ? extra.resourceLinks : [],
        blocksProject: Boolean(extra.blocksProject),
        notes: extra.notes || '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'RELATION_CREATE', relation })
      return { ok: true, relation }
    },

    updateRelation(id, patch) {
      dispatch({ type: 'RELATION_UPDATE', id, patch })
    },

    // 归属存在知识点这一侧，所以解除关联时把记录本身删掉就够了，
    // 不会在任务上留下任何残留。
    unlinkKnowledge(id) {
      dispatch({ type: 'RELATION_DELETE', id })
    },

    // 这个知识点服务于路线上的哪一步。传 null 表示取消安排。
    setKnowledgeStep(relationId, taskId) {
      if (taskId && !state().tasks.some((t) => t.id === taskId)) {
        return { ok: false, reason: 'NO_SUCH_TASK' }
      }
      dispatch({
        type: 'RELATION_UPDATE',
        id: relationId,
        patch: { stepTaskId: taskId || null, updatedAt: nowISO() },
      })
      return { ok: true }
    },

    // AI 建议和模板库都走这里：同名概念复用，不重复创建
    addKnowledgeItems(projectId, items = []) {
      const s = state()
      const newConcepts = []
      const newRelations = []
      let reused = 0
      let skipped = 0

      // AI 给的归属 id 不能直接信，只认本项目真实存在的任务
      const stepIds = new Set(
        s.tasks.filter((t) => t.projectId === projectId).map((t) => t.id),
      )

      for (const item of items) {
        const name = (item.name || '').trim()
        if (!name) continue

        let concept =
          newConcepts.find((c) => normalizeName(c.name) === normalizeName(name)) ||
          findConceptByName(name, s.knowledgeConcepts)

        if (concept) {
          reused += 1
        } else {
          concept = {
            id: makeId('kc'),
            name,
            category: item.category || '其他',
            description: item.description || '',
            defaultResources: Array.isArray(item.defaultResources) ? item.defaultResources : [],
            createdAt: nowISO(),
            updatedAt: nowISO(),
          }
          newConcepts.push(concept)
        }

        const already = [...s.projectKnowledge, ...newRelations].some(
          (k) => k.projectId === projectId && k.conceptId === concept.id,
        )
        if (already) {
          skipped += 1
          continue
        }

        newRelations.push({
          id: makeId('pk'),
          conceptId: concept.id,
          projectId,
          reasonNeeded: item.reasonNeeded || '',
          status: item.status || 'notStarted',
          estimatedMinutes: item.estimatedMinutes ?? null,
          resourceLinks: Array.isArray(item.resourceLinks) ? item.resourceLinks : [],
          blocksProject: Boolean(item.blocksProject),
          notes: item.notes || '',
          stepTaskId: stepIds.has(item.stepId) ? item.stepId : null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        })
      }

      if (newConcepts.length || newRelations.length) {
        dispatch({ type: 'KNOWLEDGE_BULK_ADD', concepts: newConcepts, relations: newRelations })
      }
      return { added: newRelations.length, newConcepts: newConcepts.length, reused, skipped }
    },

    /* ---------- Agent ---------- */

    createAgent(input = {}) {
      const agent = {
        id: makeId('a'),
        name: (input.name || '').trim() || '未命名 Agent',
        icon: input.icon || '🤖',
        category: input.category || '对话',
        type: input.type || 'web',
        description: input.description || '',
        isPinned: Boolean(input.isPinned),
        projectIds: Array.isArray(input.projectIds) ? input.projectIds : [],
        url: input.url || '',
        localPath: input.localPath || '',
        command: input.command || '',
        args: Array.isArray(input.args) ? input.args : [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'AGENT_CREATE', agent })
      return agent
    },

    updateAgent(id, patch) {
      dispatch({ type: 'AGENT_UPDATE', id, patch })
    },

    deleteAgent(id) {
      dispatch({ type: 'AGENT_DELETE', id })
    },

    /* ---------- Prompt 模板 ---------- */

    createTemplate(input = {}) {
      const template = {
        id: makeId('pt'),
        name: (input.name || '').trim() || '未命名模板',
        projectId: input.projectId || null,
        content: input.content || '',
        variables: Array.isArray(input.variables) ? input.variables : [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'TEMPLATE_CREATE', template })
      return template
    },

    updateTemplate(id, patch) {
      dispatch({ type: 'TEMPLATE_UPDATE', id, patch })
    },

    deleteTemplate(id) {
      dispatch({ type: 'TEMPLATE_DELETE', id })
    },

    /* ---------- 项目资料 ---------- */

    createResource(projectId, input = {}) {
      const resource = {
        id: makeId('r'),
        projectId,
        title: (input.title || '').trim() || '未命名资料',
        type: input.type || 'reference',
        description: input.description || '',
        urlOrPath: input.urlOrPath || '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
      dispatch({ type: 'RESOURCE_CREATE', resource })
      return resource
    },

    updateResource(id, patch) {
      dispatch({ type: 'RESOURCE_UPDATE', id, patch })
    },

    deleteResource(id) {
      dispatch({ type: 'RESOURCE_DELETE', id })
    },

    /* ---------- 设置 ---------- */

    updateSettings(patch) {
      dispatch({ type: 'SETTINGS_UPDATE', patch })
    },

    addCategory(name) {
      const clean = (name || '').trim()
      if (!clean) return { ok: false, message: '类别名不能为空' }
      const { categories } = state().settings
      if (categories.includes(clean)) return { ok: false, message: '这个类别已经存在' }
      dispatch({ type: 'SETTINGS_UPDATE', patch: { categories: [...categories, clean] } })
      return { ok: true }
    },

    removeCategory(name) {
      const s = state()
      const used = s.projects.filter((p) => p.category === name).length
      if (used > 0) {
        return { ok: false, message: `还有 ${used} 个项目在用这个类别，先改掉它们` }
      }
      const categories = s.settings.categories.filter((c) => c !== name)
      if (categories.length === 0) return { ok: false, message: '至少要保留一个类别' }
      dispatch({ type: 'SETTINGS_UPDATE', patch: { categories } })
      return { ok: true }
    },

    /* ---------- 整体数据 ---------- */

    loadSeed() {
      const seed = buildSeedData()
      dispatch({ type: 'DATA_IMPORT', mode: 'merge', state: { ...EMPTY_STATE, ...seed, settings: state().settings } })
      return summarize({ ...EMPTY_STATE, ...seed })
    },

    previewImport(json) {
      return summarize(parseImport(json))
    },

    importData(json, mode = 'merge') {
      const incoming = parseImport(json)
      dispatch({ type: 'DATA_IMPORT', mode, state: incoming })
      return summarize(incoming)
    },

    resetAll() {
      dispatch({ type: 'DATA_RESET', state: { ...EMPTY_STATE } })
    },

    downloadExport() {
      const payload = exportPayload(state())
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-workbench-${todayString()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return payload
    },
  }
}
