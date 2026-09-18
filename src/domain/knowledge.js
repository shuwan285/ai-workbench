// 概念名归一化：去掉空格和常见括号符号再比。
// 只用于创建时提示「是不是同一个知识点」，不作为关联依据 —— 所以改名不会断链。
export function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（）()【】[\]「」“”"']/g, '')
}

export function findConceptByName(name, concepts, excludeId = null) {
  const key = normalizeName(name)
  if (!key) return null
  return (
    concepts.find((c) => c.id !== excludeId && normalizeName(c.name) === key) || null
  )
}

// 输入名称时给候选，精确 > 前缀 > 包含
export function searchConcepts(keyword, concepts, limit = 8) {
  const key = normalizeName(keyword)
  if (!key) return []
  return concepts
    .map((c) => {
      const n = normalizeName(c.name)
      let score = 0
      if (n === key) score = 3
      else if (n.startsWith(key)) score = 2
      else if (n.includes(key)) score = 1
      return { concept: c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.concept.name.localeCompare(b.concept.name, 'zh'))
    .slice(0, limit)
    .map((x) => x.concept)
}

export const STATUS_RANK = { notStarted: 0, learning: 1, mastered: 2 }

export function isBlockingRelation(rel) {
  return Boolean(rel?.blocksProject) && rel.status !== 'mastered'
}

export function conceptIdMap(concepts) {
  const map = {}
  for (const c of concepts) map[c.id] = c
  return map
}

// 把关联记录和概念本体拼起来，界面上绝大多数地方要的都是这个
export function resolveProjectKnowledge(projectId, projectKnowledge, concepts) {
  const byId = conceptIdMap(concepts)
  return projectKnowledge
    .filter((k) => k.projectId === projectId)
    .map((k) => ({ ...k, concept: byId[k.conceptId] || null }))
    .filter((k) => k.concept)
}

export function conceptRelations(conceptId, projectKnowledge) {
  return projectKnowledge.filter((k) => k.conceptId === conceptId)
}

export function conceptReferences(conceptId, projectKnowledge, projects) {
  const byId = {}
  for (const p of projects) byId[p.id] = p
  return conceptRelations(conceptId, projectKnowledge)
    .map((relation) => ({ relation, project: byId[relation.projectId] || null }))
    .filter((r) => r.project)
}

// 有引用就不允许删。知识点是长期资产，不给一次性清空的捷径。
export function canDeleteConcept(conceptId, projectKnowledge) {
  const count = conceptRelations(conceptId, projectKnowledge).length
  return { allowed: count === 0, count }
}

export function aggregateConcept(conceptId, projectKnowledge, projects) {
  const references = conceptReferences(conceptId, projectKnowledge, projects)
  if (references.length === 0) {
    return { usedBy: 0, status: 'notStarted', blockingCount: 0, references: [] }
  }

  const blocking = references.filter((r) => isBlockingRelation(r.relation))
  // 有阻塞就按阻塞里最靠前的算，否则按全部关联里最靠前的算
  const pool = blocking.length > 0 ? blocking : references
  const status = pool.reduce(
    (acc, r) => (STATUS_RANK[r.relation.status] < STATUS_RANK[acc] ? r.relation.status : acc),
    pool[0].relation.status,
  )

  return {
    usedBy: references.length,
    status,
    blockingCount: blocking.length,
    references,
  }
}

export function groupConceptsByCategory(concepts, projectKnowledge, projects) {
  const groups = {}
  for (const concept of concepts) {
    const agg = aggregateConcept(concept.id, projectKnowledge, projects)
    const category = concept.category || '其他'
    if (!groups[category]) groups[category] = []
    groups[category].push({ concept, ...agg })
  }

  // 有阻塞的排最前，其余按掌握程度由浅到深
  const rank = (x) => (x.blockingCount > 0 ? -1 : STATUS_RANK[x.status])
  for (const key of Object.keys(groups)) {
    groups[key].sort(
      (a, b) => rank(a) - rank(b) || a.concept.name.localeCompare(b.concept.name, 'zh'),
    )
  }
  return groups
}

// Prompt 里的「我需要补足的知识点」：没掌握的，阻塞项排前面
export function knowledgeGapsForProject(projectId, projectKnowledge, concepts) {
  return resolveProjectKnowledge(projectId, projectKnowledge, concepts)
    .filter((k) => k.status !== 'mastered')
    .sort((a, b) => {
      const ab = isBlockingRelation(a) ? 0 : 1
      const bb = isBlockingRelation(b) ? 0 : 1
      return ab - bb || STATUS_RANK[a.status] - STATUS_RANK[b.status]
    })
}
