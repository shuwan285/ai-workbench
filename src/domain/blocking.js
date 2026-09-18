import { isBlockingRelation, resolveProjectKnowledge } from './knowledge.js'

export function blockingItemsOfProject(projectId, projectKnowledge) {
  return projectKnowledge.filter(
    (k) => k.projectId === projectId && isBlockingRelation(k),
  )
}

export function isProjectBlocked(projectId, projectKnowledge) {
  return blockingItemsOfProject(projectId, projectKnowledge).length > 0
}

// { projectId: 阻塞数量 }，项目卡上直接查
export function projectBlockingCounts(projects, projectKnowledge) {
  const counts = {}
  for (const p of projects) counts[p.id] = 0
  for (const k of projectKnowledge) {
    if (isBlockingRelation(k) && counts[k.projectId] !== undefined) {
      counts[k.projectId] += 1
    }
  }
  return counts
}

export function totalBlockingCount(projects, projectKnowledge) {
  const activeIds = new Set(projects.filter((p) => !p.archived).map((p) => p.id))
  return projectKnowledge.filter(
    (k) => activeIds.has(k.projectId) && isBlockingRelation(k),
  ).length
}

// 首页提醒卡用：哪些项目被卡住、分别卡在什么知识点上
export function blockingOverview(projects, projectKnowledge, concepts) {
  return projects
    .filter((p) => !p.archived && p.status !== 'done')
    .map((project) => ({
      project,
      items: resolveProjectKnowledge(project.id, projectKnowledge, concepts).filter(
        isBlockingRelation,
      ),
    }))
    .filter((entry) => entry.items.length > 0)
}
