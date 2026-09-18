// 知识点建议的结构化输出 schema。
//
// 注意结构化输出的限制（和普通 JSON Schema 不完全一样）：
//   - 每个 object 都必须写 additionalProperties: false
//   - 不支持 minimum / maximum / minLength / maxLength 这类约束
//   - 不支持 minItems / maxItems 这类数组约束
// 所以「5 到 8 条」这种数量要求只能写在提示词里，返回后再由服务端裁剪。

export const AI_CATEGORIES = ['编程', '设计', '研究', 'AI工具', '写作', '其他']

export const KNOWLEDGE_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '知识点的通用名称，例如「理解曝光三要素」',
          },
          category: {
            type: 'string',
            enum: AI_CATEGORIES,
          },
          reasonNeeded: {
            type: 'string',
            description: '这个具体项目为什么需要它，不要写通用套话',
          },
          estimatedMinutes: {
            type: 'integer',
            description: '零基础到能用的估计时长，单位分钟',
          },
          stepId: {
            type: 'string',
            description:
              '要在哪一步之前补掉它 —— 填任务列表里那个方括号里的 id。看不出就看空字符串。',
          },
          unrelated: {
            type: 'boolean',
            description: '这条跟这个项目本身没关系（凑数的、放之四海皆准的），填 true',
          },
        },
        required: ['name', 'category', 'reasonNeeded', 'estimatedMinutes', 'stepId', 'unrelated'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

// 「把这些知识点排到各步」用的 schema。和上面那条的区别：那条是生成新的，
// 这条是对已有的做归属，所以按 conceptId 回指，不产生新知识点。
export const STEP_ASSIGNMENT_SCHEMA = {
  type: 'object',
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          conceptId: {
            type: 'string',
            description: '知识点列表里方括号里的 id，原样回填',
          },
          stepId: {
            type: 'string',
            description: '要在哪一步之前补掉它，填任务列表里方括号里的 id；看不出就填空字符串',
          },
          unrelated: {
            type: 'boolean',
            description: '这条跟这个项目本身没关系，填 true',
          },
          reason: {
            type: 'string',
            description: '为什么排在这一步，一句话，落到这个项目上',
          },
        },
        required: ['conceptId', 'stepId', 'unrelated', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['assignments'],
  additionalProperties: false,
}

// 「把这个项目拆成几步」用的 schema。每步除了标题，还要说清
// 「要做什么」和「算完成」—— 执行路线要照着这两条才能动手。
export const PROJECT_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '一行能读完的短标题，例如「挑出三十张并试着排序」',
          },
          description: {
            type: 'string',
            description: '具体要做什么，细到能照着动手，落到这个项目上',
          },
          doneWhen: {
            type: 'string',
            description: '做到什么程度算完成，要能判断「完了没有」',
          },
        },
        required: ['title', 'description', 'doneWhen'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
}

// 「照这份计划做完，能不能交付」用的 schema。
// 应用自己保证不了完整度 —— 只能让模型对着项目描述复核一遍。
export const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      description: '一句话结论：照这份计划做完，这个项目能不能交付',
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['missing_step', 'missing_knowledge', 'weak_step'],
            description:
              'missing_step=缺一整步；missing_knowledge=某步要的知识点没挂；weak_step=这步说不清或做不完',
          },
          about: {
            type: 'string',
            description:
              '涉及哪一步，填那一步的标题；kind=missing_step 时填建议新增的步骤标题',
          },
          detail: {
            type: 'string',
            description: '缺什么、为什么算缺，要落到这个项目上',
          },
          knowledgeName: {
            type: 'string',
            description: 'kind=missing_knowledge 时填建议补的知识点名称，其余情况填空字符串',
          },
        },
        required: ['kind', 'about', 'detail', 'knowledgeName'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'gaps'],
  additionalProperties: false,
}

export const GAP_KINDS = ['missing_step', 'missing_knowledge', 'weak_step']
export const MAX_GAPS = 12

export function normalizeGaps(raw) {
  if (!raw || !Array.isArray(raw.gaps)) return { verdict: '', gaps: [] }

  const out = []
  for (const g of raw.gaps) {
    const about = String(g?.about || '').trim()
    const detail = String(g?.detail || '').trim()
    if (!about || !detail) continue
    // 模型可能编出枚举外的 kind，不认的一律当「这步说不清」处理
    const kind = GAP_KINDS.includes(g?.kind) ? g.kind : 'weak_step'

    out.push({
      kind,
      about: about.slice(0, 200),
      detail: detail.slice(0, 800),
      knowledgeName: String(g?.knowledgeName || '').trim().slice(0, 200),
    })

    if (out.length >= MAX_GAPS) break
  }

  return { verdict: String(raw.verdict || '').trim().slice(0, 500), gaps: out }
}

// 数量在提示词里约定，这里做兜底裁剪 + 校验。
//
// 下限是**硬指标**，不是建议：给少了使用者会中途卡住。生成之后由 planShortfall /
// knowledgeShortfall 检查，不达标就把「缺什么」告诉模型重来一次（见 anthropic.js）。
//
// 上限给得宽，因为知识点按步骤生成。这个数别卡太死：实测 10 步的项目一次能出 30+ 条，
// 卡在 30 会把最后几步要的东西**裁掉**，然后被下面的校验判成「那几步没知识点」——
// 明明是上限的问题，看起来却像模型偷懒。14 步 × 3 条 ≈ 42，留点余量。
export const MIN_ITEMS = 8
export const MAX_ITEMS = 45
export const MIN_STEPS = 6
export const MAX_STEPS = 14

// 拆解够不够。返回一句「缺什么」，够了返回 null。
export function planShortfall(steps) {
  const problems = []
  if (steps.length < MIN_STEPS) {
    problems.push(`只给了 ${steps.length} 步，至少要 ${MIN_STEPS} 步`)
  }
  const thin = steps.filter((s) => !s.description || !s.doneWhen).map((s) => s.title)
  if (thin.length > 0) {
    problems.push(`这些步骤没写清「要做什么」或「算完成」：${thin.join('、')}`)
  }
  return problems.length > 0 ? problems.join('；') : null
}

// 知识点够不够。tasks 为空表示项目还没拆步骤，那条路径不做覆盖校验。
export function knowledgeShortfall(items, tasks = []) {
  const problems = []
  if (items.length < MIN_ITEMS) {
    problems.push(`只给了 ${items.length} 条，至少要 ${MIN_ITEMS} 条`)
  }

  if (tasks.length > 0) {
    const covered = new Set(items.map((i) => i.stepId).filter(Boolean))
    const bare = tasks.filter((t) => !covered.has(t.id)).map((t) => t.title)
    if (bare.length > 0) {
      problems.push(`这些步骤一条知识点都没分到，做到那里会直接卡住：${bare.join('、')}`)
    }
  }

  return problems.length > 0 ? problems.join('；') : null
}

export function normalizeSteps(raw) {
  if (!raw || !Array.isArray(raw.steps)) return []

  const seen = new Set()
  const out = []

  for (const step of raw.steps) {
    const title = String(step?.title || '').trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      title: title.slice(0, 120),
      description: String(step?.description || '').trim().slice(0, 1000),
      doneWhen: String(step?.doneWhen || '').trim().slice(0, 500),
    })

    if (out.length >= MAX_STEPS) break
  }

  return out
}

// 模型可能编出列表里没有的 stepId，所以这里必须拿真实任务 id 过一遍。
// 传空数组表示「这个项目还没有任务」，那所有归属都只能是空。
function validStep(stepId, taskIds) {
  const id = String(stepId || '').trim()
  if (!id) return null
  return taskIds.has(id) ? id : null
}

export function normalizeItems(raw, tasks = []) {
  if (!raw || !Array.isArray(raw.items)) return []

  const taskIds = new Set(tasks.map((t) => t && t.id).filter(Boolean))
  const seen = new Set()
  const out = []

  for (const item of raw.items) {
    const name = String(item?.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const minutes = Number(item?.estimatedMinutes)

    out.push({
      name,
      category: AI_CATEGORIES.includes(item?.category) ? item.category : '其他',
      reasonNeeded: String(item?.reasonNeeded || '').trim(),
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
      defaultResources: [],
      stepId: validStep(item?.stepId, taskIds),
      unrelated: Boolean(item?.unrelated),
    })

    if (out.length >= MAX_ITEMS) break
  }

  return out
}

export function normalizeAssignments(raw, knowledge, tasks = []) {
  if (!raw || !Array.isArray(raw.assignments)) return []

  const taskIds = new Set(tasks.map((t) => t && t.id).filter(Boolean))
  const known = new Map(knowledge.map((k) => [k.conceptId, k]))
  const seen = new Set()
  const out = []

  for (const row of raw.assignments) {
    const conceptId = String(row?.conceptId || '').trim()
    // 只认传进去的那些知识点，模型凭空多出来的丢掉
    if (!conceptId || !known.has(conceptId) || seen.has(conceptId)) continue
    seen.add(conceptId)

    out.push({
      conceptId,
      stepId: validStep(row?.stepId, taskIds),
      unrelated: Boolean(row?.unrelated),
      reason: String(row?.reason || '').trim(),
    })
  }

  return out
}
