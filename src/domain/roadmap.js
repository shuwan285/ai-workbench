import { isBlockingRelation, resolveProjectKnowledge } from './knowledge.js'

// 「执行路线」：按任务的 order 排开，把每一步要补的知识点挂到它下面。
//
// 归属存在**知识点那一侧**：relation.stepTaskId 指向路线上的某一步，可以是 null（还没安排）。
// 单个 id 而不是数组 —— 一个知识点只跟一步走，这件事由数据结构本身保证，
// 不用在代码里到处防重复。
//
// 任务和知识点本来各存各的，这是中间那根连线。存 id 而不是引用对象，
// 所以删任务、改任务名都不会把知识点带坏；指向了不存在的步骤时，
// 会被当成「还没安排」处理，不会凭空消失。

function decorate(rel) {
  return {
    relationId: rel.id,
    conceptId: rel.conceptId,
    concept: rel.concept,
    status: rel.status,
    isMastered: rel.status === 'mastered',
    // blocksProject 且还没掌握 —— 不做这一步就会卡住
    isBlocking: isBlockingRelation(rel),
    estimatedMinutes: rel.estimatedMinutes,
    reasonNeeded: rel.reasonNeeded,
    stepTaskId: rel.stepTaskId || null,
  }
}

export function projectTasks(projectId, tasks) {
  return tasks
    .filter((t) => t.projectId === projectId)
    .slice()
    .sort((a, b) => a.order - b.order)
}

// ① 到 ⑳，再多就退回普通数字。路线和知识点清单都用它编号，保证两处对得上。
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

export function stepMarker(index) {
  return CIRCLED[index] || String(index + 1)
}

// 按顺序返回每一步：任务 + 挂在它下面的知识点
export function buildRoadmap(projectId, tasks, projectKnowledge, concepts) {
  const steps = projectTasks(projectId, tasks)
  const known = new Set(steps.map((t) => t.id))

  const byStep = new Map()
  for (const rel of resolveProjectKnowledge(projectId, projectKnowledge, concepts)) {
    const k = decorate(rel)
    if (!k.stepTaskId || !known.has(k.stepTaskId)) continue
    if (!byStep.has(k.stepTaskId)) byStep.set(k.stepTaskId, [])
    byStep.get(k.stepTaskId).push(k)
  }

  return steps.map((task) => {
    const knowledge = byStep.get(task.id) || []
    const isDone = task.status === 'done'

    return {
      task,
      knowledge,
      isDone,
      // 还没掌握、且被标成阻塞的 —— 该在动手前补掉
      blockingGaps: knowledge.filter((k) => k.isBlocking),
      // 任务说完成了，但这一步要的知识点还标着没掌握
      hasMismatch: isDone && knowledge.some((k) => !k.isMastered),
    }
  })
}

// 还没安排到任何一步的知识点。指向了已删除步骤的也算。
export function unassignedKnowledge(projectId, tasks, projectKnowledge, concepts) {
  const known = new Set(projectTasks(projectId, tasks).map((t) => t.id))
  return resolveProjectKnowledge(projectId, projectKnowledge, concepts)
    .map(decorate)
    .filter((k) => !k.stepTaskId || !known.has(k.stepTaskId))
}

export function roadmapSummary(steps, unassigned = []) {
  return {
    total: steps.length,
    done: steps.filter((s) => s.isDone).length,
    // 一个知识点都没安排的步骤 —— 录入进度一目了然
    empty: steps.filter((s) => s.knowledge.length === 0).length,
    blocking: steps.filter((s) => s.blockingGaps.length > 0).length,
    mismatches: steps.filter((s) => s.hasMismatch).length,
    unassigned: unassigned.length,
    // 「你在这」：第一条进行中的；没有就取第一条没完成的
    current: steps.find((s) => s.task.status === 'doing') || steps.find((s) => !s.isDone) || null,
  }
}

// 任务标完成时要问一句「这一步的知识点还标着没掌握，要一起改吗」。
// 单独一个函数，是因为它要在改状态**之前**调用，不值得为它构建整条路线。
export function unmasteredKnowledgeOf(task, projectKnowledge, concepts) {
  if (!task) return []
  return resolveProjectKnowledge(task.projectId, projectKnowledge, concepts)
    .map(decorate)
    .filter((k) => k.stepTaskId === task.id && !k.isMastered)
}
