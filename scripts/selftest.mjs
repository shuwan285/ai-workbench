// 领域逻辑自测。跑法：node scripts/selftest.mjs
// 只覆盖不依赖浏览器渲染的部分，界面行为需要人工在浏览器里过一遍。

// persistence.js 会读 localStorage，先打个桩
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const { buildSeedData } = await import('../src/data/seed.js')
const { reducer } = await import('../src/store/reducer.js')
const {
  exportPayload,
  normalizeState,
  parseImport,
  readAiBannerDismissed,
  readMeta,
  readMirror,
  summarize,
  writeAiBannerDismissed,
  writeMeta,
  writeMirror,
} = await import('../src/store/persistence.js')
const { BOOT_REASONS, decideBoot } = await import('../src/store/recovery.js')
const { computeProgress, progressDetail, allTasksDone } = await import(
  '../src/domain/progress.js'
)
const { buildProjectPrompt, fillTemplate, extractVariables, PENDING } = await import(
  '../src/domain/promptBuilder.js'
)
const {
  canDeleteConcept,
  conceptReferences,
  findConceptByName,
  isBlockingRelation,
  normalizeName,
  resolveProjectKnowledge,
} = await import('../src/domain/knowledge.js')
const { blockingOverview, projectBlockingCounts, totalBlockingCount } = await import(
  '../src/domain/blocking.js'
)
const { getDeadlineInfo } = await import('../src/domain/deadline.js')
const { normalizeConstraints, addConstraint } = await import('../src/domain/constraints.js')
const { buildRoadmap, projectTasks, roadmapSummary, unassignedKnowledge, unmasteredKnowledgeOf } =
  await import('../src/domain/roadmap.js')
const { createActions } = await import('../src/store/actions.js')
// normalizeItems 在后面「真实模型接入」那组还会再导一次，这里换个名字避开重复声明
const {
  knowledgeShortfall,
  normalizeAssignments,
  normalizeGaps,
  normalizeItems: checkSuggestedItems,
  normalizeSteps,
  planShortfall,
} =
  await import('../server/lib/ai/schema.js')
const {
  assignKnowledgeSteps: mockAssignSteps,
  planProject: mockPlanProject,
  reviewPlan: mockReviewPlan,
} = await import('../server/lib/mock-ai.js')
const { parseJsonLoose, schemaInstruction } = await import('../server/lib/ai/anthropic.js')
const { PROJECT_PLAN_SCHEMA, KNOWLEDGE_SUGGESTION_SCHEMA: SUGGEST_SCHEMA } = await import(
  '../server/lib/ai/schema.js'
)

let pass = 0
let fail = 0
const lines = []

function group(title) {
  lines.push(`\n${title}`)
}

function check(name, cond, detail = '') {
  if (cond) {
    pass += 1
    lines.push(`  ✓ ${name}`)
  } else {
    fail += 1
    lines.push(`  ✗ ${name}${detail ? `  ← ${detail}` : ''}`)
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`)
}

/* ---------- 准备数据 ---------- */
const seed = buildSeedData()
const base = normalizeState({ ...seed, settings: { theme: 'light', categories: ['课程作业', '编程开发', '论文与研究'] } })

/* ---------- 1. 进度计算 ---------- */
group('进度计算')
const ofdm = base.projects.find((p) => p.id === 'p_photo')
const d1 = progressDetail(ofdm, base.tasks)
eq('自动模式：2/6 任务完成 → 33%', d1.value, 33)
eq('自动模式统计完成数', d1.done, 2)
eq('自动模式统计总数', d1.total, 6)

const emptyProject = { id: 'p_empty', progressMode: 'auto', manualProgress: 0 }
eq('没有任务时进度为 0', computeProgress(emptyProject, base.tasks), 0)

const manualProject = { id: 'p_photo', progressMode: 'manual', manualProgress: 77 }
eq('手动模式读 manualProgress', computeProgress(manualProject, base.tasks), 77)
eq('手动模式超范围会被截断', computeProgress({ id: 'x', progressMode: 'manual', manualProgress: 140 }, []), 100)

const paper = base.projects.find((p) => p.id === 'p_survey')
check('全部任务完成能被识别', allTasksDone(paper, base.tasks))
check('未全部完成不会被误判', !allTasksDone(ofdm, base.tasks))

/* ---------- 2. reducer：任务移动与进度同步 ---------- */
group('reducer · 任务与进度')
const moved = reducer(base, { type: 'TASK_MOVE', id: 't_4', status: 'done', index: 0 })
eq('把待开始任务移到已完成 → 50%', moved.projects.find((p) => p.id === 'p_photo').progress, 50)

const backToTodo = reducer(moved, { type: 'TASK_MOVE', id: 't_4', status: 'todo', index: 0 })
eq('移回待开始 → 33%', backToTodo.projects.find((p) => p.id === 'p_photo').progress, 33)
eq(
  '移出已完成会清空 completedAt',
  backToTodo.tasks.find((t) => t.id === 't_4').completedAt,
  null,
)

const doneTask = moved.tasks.find((t) => t.id === 't_4')
check('移入已完成会写 completedAt', Boolean(doneTask.completedAt))

/* ---------- 3. reducer：删除项目的级联 ---------- */
group('reducer · 删除项目')
const afterDelete = reducer(base, { type: 'PROJECT_DELETE', id: 'p_photo' })
eq('项目被删掉', afterDelete.projects.filter((p) => p.id === 'p_photo').length, 0)
eq('该项目的任务被级联删除', afterDelete.tasks.filter((t) => t.projectId === 'p_photo').length, 0)
eq(
  '该项目的知识点关联被级联删除',
  afterDelete.projectKnowledge.filter((k) => k.projectId === 'p_photo').length,
  0,
)
eq('知识点本体全部保留', afterDelete.knowledgeConcepts.length, base.knowledgeConcepts.length)
eq('其他项目的任务不受影响', afterDelete.tasks.filter((t) => t.projectId === 'p_recipes').length, 3)

/* ---------- 4. 知识点概念层：复用与改名 ---------- */
group('知识点 · 概念层')
const litConcept = base.knowledgeConcepts.find((c) => c.id === 'kc_research')
const litRefs = conceptReferences('kc_research', base.projectKnowledge, base.projects)
eq('kc_research 被 2 个项目使用', litRefs.length, 2)
check(
  '使用它的项目是菜谱小程序和旧物交换调研',
  litRefs.map((r) => r.project.id).sort().join(',') === 'p_recipes,p_survey',
)

const renamed = reducer(base, {
  type: 'CONCEPT_UPDATE',
  id: 'kc_research',
  patch: { name: '先看别人怎么做的（改名后）' },
})
eq(
  '改名后关联数量不变',
  conceptReferences('kc_research', renamed.projectKnowledge, renamed.projects).length,
  2,
)
eq('改名后关联 id 不变', renamed.projectKnowledge.filter((k) => k.conceptId === 'kc_research').length, 2)

eq('归一化忽略空格和括号', normalizeName(' 理解曝光三要素（基础） '), normalizeName('理解曝光三要素基础'))
check(
  '按名称能找到已有概念',
  findConceptByName('曝光三要素：光圈、快门、ISO', base.knowledgeConcepts)?.id === 'kc_exposure',
)

/* ---------- 5. 知识点删除保护 ---------- */
group('知识点 · 删除保护')
const blockedDelete = canDeleteConcept('kc_research', base.projectKnowledge)
check('有引用时不允许删除', blockedDelete.allowed === false)
eq('报告引用数量', blockedDelete.count, 2)

const orphan = reducer(base, {
  type: 'PROJECT_DELETE',
  id: 'p_survey',
})
const afterOrphan = reducer(orphan, { type: 'PROJECT_DELETE', id: 'p_recipes' })
const freeConcept = canDeleteConcept('kc_research', afterOrphan.projectKnowledge)
check('两个项目都删掉后变成可删', freeConcept.allowed === true)

// kc_ref 只被旧物交换调研引用，项目删掉后它就零引用了，应该能删
eq(
  '只剩一个项目时 kc_ref 已零引用',
  canDeleteConcept('kc_ref', afterOrphan.projectKnowledge).count,
  0,
)
const orphanDeleted = reducer(afterOrphan, { type: 'CONCEPT_DELETE', id: 'kc_ref' })
eq('零引用时能删掉', orphanDeleted.knowledgeConcepts.filter((c) => c.id === 'kc_ref').length, 0)

// 街拍摄影作业还在，它的概念仍被引用，reducer 要挡住
eq(
  'kc_exposure 仍被街拍摄影作业引用',
  canDeleteConcept('kc_exposure', afterOrphan.projectKnowledge).count,
  1,
)
const guarded = reducer(afterOrphan, { type: 'CONCEPT_DELETE', id: 'kc_exposure' })
eq('仍被引用时 reducer 拒绝删除', guarded.knowledgeConcepts.filter((c) => c.id === 'kc_exposure').length, 1)

/* ---------- 6. 阻塞判定 ---------- */
group('知识点 · 阻塞')
const ofdmKnowledge = resolveProjectKnowledge('p_photo', base.projectKnowledge, base.knowledgeConcepts)
eq('街拍摄影作业有 5 条知识点', ofdmKnowledge.length, 5)
eq('其中 2 条阻塞', ofdmKnowledge.filter(isBlockingRelation).length, 2)

const counts = projectBlockingCounts(base.projects, base.projectKnowledge)
eq('摄影作业阻塞数', counts.p_photo, 2)
eq('菜谱小程序阻塞数', counts.p_recipes, 1)
eq('旧物交换调研阻塞数', counts.p_survey, 0)
eq('全局阻塞总数只算未归档项目', totalBlockingCount(base.projects, base.projectKnowledge), 3)

const overview = blockingOverview(base.projects, base.projectKnowledge, base.knowledgeConcepts)
eq('阻塞概览覆盖 2 个项目', overview.length, 2)

const mastered = reducer(base, {
  type: 'RELATION_UPDATE',
  id: 'pk_1',
  patch: { status: 'mastered' },
})
const afterMaster = resolveProjectKnowledge('p_photo', mastered.projectKnowledge, mastered.knowledgeConcepts)
eq('标记已掌握后不再是阻塞', afterMaster.filter(isBlockingRelation).length, 1)

/* ---------- 6b. 执行路线：知识点挂在路线的哪一步 ---------- */
group('执行路线')
const road = buildRoadmap('p_photo', base.tasks, base.projectKnowledge, base.knowledgeConcepts)
eq('按 order 排出 6 步', road.length, 6)
eq('第一步是最早的那条', road[0].task.id, 't_1')
eq('最后一步是最后那条', road[road.length - 1].task.id, 't_6')

const step4 = road.find((s) => s.task.id === 't_4')
eq('第 4 步挂着 1 个知识点', step4.knowledge.length, 1)
eq('挂的是曝光那条', step4.knowledge[0].conceptId, 'kc_exposure')
check('这一条还没掌握', !step4.knowledge[0].isMastered)
check('这一条是阻塞项', step4.knowledge[0].isBlocking)
eq('所以这一步有 1 个「先补这个」', step4.blockingGaps.length, 1)

check('已完成 + 知识点已掌握 → 不算对不上', !road.find((s) => s.task.id === 't_2').hasMismatch)
check('已完成但知识点还标着没掌握 → 算对不上', road.find((s) => s.task.id === 't_1').hasMismatch)
eq('没安排知识点的步骤是空的', road.find((s) => s.task.id === 't_6').knowledge.length, 0)

const loose = unassignedKnowledge('p_photo', base.tasks, base.projectKnowledge, base.knowledgeConcepts)
eq('有 1 个知识点还没安排到哪一步', loose.length, 1)
eq('未安排的是 CP', loose[0].conceptId, 'kc_light')

const roadSum = roadmapSummary(road, loose)
eq('汇总：总步数', roadSum.total, 6)
eq('汇总：已完成', roadSum.done, 2)
eq('汇总：没安排知识点的步数', roadSum.empty, 2)
eq('汇总：对不上的步数', roadSum.mismatches, 1)
eq('汇总：未安排的知识点数', roadSum.unassigned, 1)
eq('「你在这」落在进行中的那条', roadSum.current.task.id, 't_3')

// 指向了不存在的步骤（比如那一步被删了）→ 当作未安排，不会凭空消失
const danglingKnowledge = base.projectKnowledge.map((k) =>
  k.id === 'pk_1' ? { ...k, stepTaskId: 't_已经删了' } : k,
)
const danglingRoad = buildRoadmap('p_photo', base.tasks, danglingKnowledge, base.knowledgeConcepts)
eq('指向已删步骤的知识点不出现在路线里', danglingRoad.find((s) => s.task.id === 't_4').knowledge.length, 0)
check(
  '而是回到「未安排」，不会两头都看不见',
  unassignedKnowledge('p_photo', base.tasks, danglingKnowledge, base.knowledgeConcepts).some(
    (k) => k.conceptId === 'kc_exposure',
  ),
)

const t4 = base.tasks.find((t) => t.id === 't_4')
eq('未掌握的知识点能单独查出来（给完成任务时的提示用）',
  unmasteredKnowledgeOf(t4, base.projectKnowledge, base.knowledgeConcepts).length, 1)
const t6 = base.tasks.find((t) => t.id === 't_6')
eq('没安排知识点的任务查出来是空的',
  unmasteredKnowledgeOf(t6, base.projectKnowledge, base.knowledgeConcepts).length, 0)

/* ---------- 6c. 归属的读写与清理 ---------- */
group('归属的读写与清理')
{
  let s = base
  const actions = createActions(
    (action) => {
      s = reducer(s, action)
    },
    () => s,
  )
  const roadOf = () => buildRoadmap('p_photo', s.tasks, s.projectKnowledge, s.knowledgeConcepts)
  const looseOf = () =>
    unassignedKnowledge('p_photo', s.tasks, s.projectKnowledge, s.knowledgeConcepts)

  // 归属是单个 id，改指向就是直接改 —— 不需要先去别处清理
  eq('改指向返回成功', actions.setKnowledgeStep('pk_1', 't_6').ok, true)
  eq('新步骤拿到了它', roadOf().find((x) => x.task.id === 't_6').knowledge.length, 1)
  eq('旧步骤不再有它', roadOf().find((x) => x.task.id === 't_4').knowledge.length, 0)

  actions.setKnowledgeStep('pk_1', null)
  check('取消安排后回到「未安排」', looseOf().some((k) => k.conceptId === 'kc_exposure'))
  eq('指向不存在的步骤会被拒绝', actions.setKnowledgeStep('pk_1', 't_不存在').ok, false)

  // 删掉一步，挂在它上面的知识点要回到未安排
  const removed = actions.deleteTask('t_3')
  eq('删步骤时报告解除了几个知识点的安排', removed.unassigned, 1)
  check('那个知识点回到「未安排」', looseOf().some((k) => k.conceptId === 'kc_story'))
  eq('这一步的任务也没了', s.tasks.filter((t) => t.projectId === 'p_photo').length, 5)

  // 解除知识点关联：归属存在知识点这一侧，记录删掉就没有残留
  const tasksBefore = s.tasks.length
  actions.unlinkKnowledge('pk_2')
  check('关联记录被删掉', !s.projectKnowledge.some((k) => k.id === 'pk_2'))
  eq('任务侧不受影响', s.tasks.length, tasksBefore)
}

/* ---------- 6d. AI 给的归属必须过校验 ---------- */
group('AI 归属的校验')
{
  const tasks = projectTasks('p_photo', base.tasks)

  const items = checkSuggestedItems(
    {
      items: [
        { name: '甲', category: '编程', reasonNeeded: 'r', estimatedMinutes: 10, stepId: 't_4', unrelated: false },
        { name: '乙', category: '编程', reasonNeeded: 'r', estimatedMinutes: 10, stepId: 't_编的', unrelated: false },
        { name: '丙', category: '编程', reasonNeeded: 'r', estimatedMinutes: 10, stepId: '', unrelated: true },
      ],
    },
    tasks,
  )
  eq('合法的 stepId 保留', items[0].stepId, 't_4')
  eq('模型编出来的 stepId 被清成未安排', items[1].stepId, null)
  eq('空 stepId 就是未安排', items[2].stepId, null)
  eq('unrelated 原样带过来', items[2].unrelated, true)

  const knowledge = [
    { conceptId: 'kc_exposure', name: '曝光三要素' },
    { conceptId: 'kc_color', name: '调色的分寸' },
  ]
  const proposals = normalizeAssignments(
    {
      assignments: [
        { conceptId: 'kc_exposure', stepId: 't_4', unrelated: false, reason: 'r1' },
        { conceptId: 'kc_不存在', stepId: 't_1', unrelated: false, reason: 'r2' },
        { conceptId: 'kc_color', stepId: 't_编的', unrelated: false, reason: 'r3' },
        { conceptId: 'kc_color', stepId: 't_2', unrelated: false, reason: '重复的一条' },
      ],
    },
    knowledge,
    tasks,
  )
  eq('不认识的知识点被丢掉、重复的只留一条', proposals.length, 2)
  eq('第一条归属正常', proposals[0].stepId, 't_4')
  eq('编的归属被清掉', proposals[1].stepId, null)
}

/* ---------- 6e. 导入建议时，归属要落到关联记录上 ---------- */
group('导入建议时的归属')
{
  let s = base
  const actions = createActions(
    (action) => {
      s = reducer(s, action)
    },
    () => s,
  )

  actions.addKnowledgeItems('p_photo', [
    { name: '临时甲', category: '编程', reasonNeeded: 'r', estimatedMinutes: 10, stepId: 't_4' },
    { name: '临时乙', category: '编程', reasonNeeded: 'r', estimatedMinutes: 10, stepId: 't_编的' },
  ])

  const find = (name) =>
    s.projectKnowledge.find((k) => {
      const c = s.knowledgeConcepts.find((x) => x.id === k.conceptId)
      return c && c.name === name
    })

  eq('合法的归属写进了关联记录', find('临时甲')?.stepTaskId, 't_4')
  eq('编的归属落成未安排，不写进去', find('临时乙')?.stepTaskId, null)
}

/* ---------- 6f. 模拟数据的归属（按名称匹配） ---------- */
group('模拟数据的归属')
{
  const tasks = projectTasks('p_photo', base.tasks).map((t) => ({ id: t.id, title: t.title }))
  const rows = mockAssignSteps({
    tasks,
    knowledge: [
      { conceptId: 'kc_exposure', name: '补拍时的曝光判断' },
      { conceptId: 'kc_story', name: '照片排序与取舍' },
      { conceptId: 'kc_x', name: '统计显著性与 p 值' },
    ],
  })

  eq('按名称匹配上「补拍」那一步', rows.find((r) => r.conceptId === 'kc_exposure')?.stepId, 't_4')
  eq('按名称匹配上「排序」那一步', rows.find((r) => r.conceptId === 'kc_story')?.stepId, 't_3')
  // 只拿名称比，不带上 reasonNeeded —— 带上之后「报告」「实验」这类词会把知识点误排到别的步骤。
  // 模拟数据给错答案比不给更糟，所以匹配不上就老实说未安排。
  eq('匹配不上就老实说未安排，不硬塞', rows.find((r) => r.conceptId === 'kc_x')?.stepId, null)
  check('模拟数据不会假装能判断「和项目无关」', rows.every((r) => r.unrelated === false))
  eq('没有任务时一律未安排', mockAssignSteps({ tasks: [], knowledge: [{ conceptId: 'kc_exposure', name: '曝光三要素' }] })[0].stepId, null)
}

/* ---------- 6g. 拆解项目 / 复核完整度 ---------- */
group('拆解项目与复核')
{
  const steps = normalizeSteps({
    steps: [
      { title: '第一步', description: '要做什么', doneWhen: '算完成' },
      { title: '第一步', description: '重复的', doneWhen: '' },
      { title: '', description: '没标题', doneWhen: '' },
      { title: '第二步', description: '', doneWhen: '' },
    ],
  })
  eq('去掉重复和没标题的', steps.length, 2)
  eq('标题保留', steps[0].title, '第一步')
  eq('说明保留', steps[0].description, '要做什么')
  eq('缺的字段补成空串', steps[1].doneWhen, '')

  const review = normalizeGaps({
    verdict: '结论',
    gaps: [
      { kind: 'missing_step', about: '补一步', detail: '缺', knowledgeName: '' },
      { kind: '编的 kind', about: '某步', detail: '说不清', knowledgeName: '' },
      { kind: 'weak_step', about: '', detail: '没标题', knowledgeName: '' },
    ],
  })
  eq('不认识的 kind 降级成 weak_step', review.gaps[1].kind, 'weak_step')
  eq('缺 about 的丢掉', review.gaps.length, 2)
  eq('verdict 带过来', review.verdict, '结论')

  // 模拟数据：拆解按类别给，已有步骤不重复
  const planned = mockPlanProject({ category: '课程作业', existing: [{ title: '选定题目与交付要求' }] })
  check('拆出来的每条都有说明和完成标准', planned.every((s) => s.description && s.doneWhen))
  check('项目里已有的步骤不再重复给', !planned.some((s) => s.title === '选定题目与交付要求'))

  // 模拟数据只能做结构检查 —— 结论里必须说清这一点，否则会被当成「计划是完整的」
  const weak = mockReviewPlan({ tasks: [{ title: '甲', description: '', doneWhen: '' }] })
  eq('没写要做什么的步骤被标出来', weak.gaps.length, 1)
  eq('归类为 weak_step', weak.gaps[0].kind, 'weak_step')
  check('结论里写明了模拟数据的局限', weak.verdict.includes('查不出'))

  const clean = mockReviewPlan({
    tasks: [{ title: '甲', description: '做什么', doneWhen: '算完成' }],
  })
  eq('写全了就不报问题', clean.gaps.length, 0)
}

/* ---------- 6g2. 「不能过少」是靠校验 + 重来兜的 ---------- */
group('生成够不够的校验')
{
  const tasks = projectTasks('p_photo', base.tasks).map((t) => ({ id: t.id, title: t.title }))

  // 拆解：步数和「写没写清」都要过
  check('步数太少要报出来', String(planShortfall([{ title: 'a', description: 'd', doneWhen: 'x' }])).includes('至少要'))
  check(
    '没写「要做什么」要报出来',
    String(
      planShortfall([
        { title: '甲', description: '', doneWhen: 'x' },
        { title: '乙', description: 'd', doneWhen: 'x' },
        { title: '丙', description: 'd', doneWhen: 'x' },
        { title: '丁', description: 'd', doneWhen: 'x' },
        { title: '戊', description: 'd', doneWhen: 'x' },
        { title: '己', description: 'd', doneWhen: 'x' },
      ]),
    ).includes('甲'),
  )
  eq(
    '够了就返回 null',
    planShortfall(
      Array.from({ length: 6 }, (_, i) => ({ title: `第${i}步`, description: 'd', doneWhen: 'x' })),
    ),
    null,
  )

  // 知识点：总数下限 + 每一步都得有。每步两条，总数就过下限了
  const twoEach = tasks.flatMap((t) => [
    { name: `${t.title}-甲`, stepId: t.id },
    { name: `${t.title}-乙`, stepId: t.id },
  ])
  eq('每步都有、条数也够 → 不算缺', knowledgeShortfall(twoEach, tasks), null)

  const missingOne = twoEach.filter((k) => k.stepId !== tasks[0].id)
  check(
    '哪一步一条都没有时要指名道姓',
    String(knowledgeShortfall(missingOne, tasks)).includes(tasks[0].title),
  )
  check(
    '条数不够也要报',
    String(knowledgeShortfall([{ name: 'x', stepId: tasks[0].id }], [])).includes('至少要'),
  )
  eq('没拆步骤时不做覆盖校验（免得凭空要人补）', knowledgeShortfall([], []).includes('步骤'), false)
}

/* ---------- 6h. 兼容模式：自己从返回里挖 JSON ---------- */
group('兼容模式的解析')
{
  const ok = { items: [{ name: '甲' }] }

  eq(
    '纯粹是 JSON 时直接解析',
    JSON.stringify(parseJsonLoose(JSON.stringify(ok))),
    JSON.stringify(ok),
  )
  eq(
    '带 markdown 代码块也能解',
    JSON.stringify(parseJsonLoose('```json\n' + JSON.stringify(ok) + '\n```')),
    JSON.stringify(ok),
  )
  eq(
    '前后有寒暄也能解',
    JSON.stringify(parseJsonLoose(`好的，我来分析一下：\n${JSON.stringify(ok)}\n有需要再问我。`)),
    JSON.stringify(ok),
  )
  check(
    '代码块里再带寒暄也解得出',
    JSON.stringify(parseJsonLoose('```\n这是结果：\n' + JSON.stringify(ok) + '\n```')) ===
      JSON.stringify(ok),
  )
  // 这条踩过：模型在 JSON 后面又举了个例子，取「第一个 { 到最后一个 }」会多挖一大截
  check(
    'JSON 后面还跟着别的花括号时不多挖',
    JSON.stringify(
      parseJsonLoose(`${JSON.stringify(ok)}\n\n注意 {"name": "这是另一个例子"}`),
    ) === JSON.stringify(ok),
  )
  check(
    '字符串里的花括号不影响配对',
    JSON.stringify(parseJsonLoose('{"a": "值里有 } 和 { 两种括号"}')) ===
      JSON.stringify({ a: '值里有 } 和 { 两种括号' }),
  )

  let threw = false
  try {
    parseJsonLoose('')
  } catch {
    threw = true
  }
  check('空返回要抛错，不能静默给空对象', threw)

  threw = false
  try {
    parseJsonLoose('抱歉，我无法完成这个请求。')
  } catch {
    threw = true
  }
  check('完全没有 JSON 时抛错', threw)

  // 实测 deepseek-chat 会漏掉键名的引号，回成 JavaScript 对象字面量的样子。
  // 不补的话整条路径都退回模拟数据，而内容其实完全可用。
  check(
    '裸键名能补上引号',
    JSON.stringify(parseJsonLoose('{verdict: "能做", gaps: [{kind: "missing_step"}]}')) ===
      JSON.stringify({ verdict: '能做', gaps: [{ kind: 'missing_step' }] }),
  )
  check(
    '裸键名且键后无空格也能补',
    JSON.stringify(parseJsonLoose('{verdict:"能做"}')) === JSON.stringify({ verdict: '能做' }),
  )
  check(
    '嵌套的裸键名一起补',
    JSON.stringify(parseJsonLoose('{a: {b: {c: 1}}}')) === JSON.stringify({ a: { b: { c: 1 } } }),
  )
  // 补引号是最后一道，失败时才用 —— 不能把已经合法的内容改坏
  check(
    '合法的 JSON 走原路，不受影响',
    JSON.stringify(parseJsonLoose('{"a": 1, "b": [1, 2]}')) ===
      JSON.stringify({ a: 1, b: [1, 2] }),
  )
  // 逐字符扫描而不用正则，图的就是这两条
  check(
    '不碰字符串值里的键名形状',
    JSON.stringify(parseJsonLoose('{note: "写法是 {a: 1} 这样"}')) ===
      JSON.stringify({ note: '写法是 {a: 1} 这样' }),
  )
  check(
    '数组里的裸字符串不当键名',
    JSON.stringify(parseJsonLoose('{"list": ["a", "b"]}')) === JSON.stringify({ list: ['a', 'b'] }),
  )

  // 提示词里要把字段名和枚举值说清楚，否则模型只能猜
  const instruction = schemaInstruction(PROJECT_PLAN_SCHEMA)
  check('写明了顶层字段名', instruction.includes('steps'))
  check('写明了嵌套字段名', instruction.includes('doneWhen'))
  check('枚举值也列出来了', schemaInstruction(SUGGEST_SCHEMA).includes('编程'))
  check('要求了只输出 JSON', instruction.includes('只输出一个 JSON 对象'))
}

/* ---------- 7. Prompt 组装 ---------- */
group('Prompt 组装')
const ofdmTasks = base.tasks.filter((t) => t.projectId === 'p_photo')
const prompt = buildProjectPrompt({
  project: ofdm,
  tasks: base.tasks,
  projectKnowledge: base.projectKnowledge,
  concepts: base.knowledgeConcepts,
})
const text = prompt.text

check('包含项目名称', text.includes('街拍摄影作业'))
check('包含类别', text.includes('课程作业'))
check('包含进度数字', text.includes('项目进度：33%'))
check('包含下一步行动', text.includes('把备选的照片排一遍'))
check('包含未完成任务', text.includes('挑出三十张并试着排序'))
check('已完成的任务不出现在待办里', !text.includes('- [高] 先拍够一批素材'))
check('包含知识点缺口', text.includes('曝光三要素：光圈、快门、ISO'))
check('阻塞项被标注', text.includes('阻塞当前任务'))
check('包含工具与限制', text.includes('只有手机和一台借来的微单'))
check(
  '多个限制按行拼接，顺序不变',
  text.includes(
    '只有手机和一台借来的微单，没有别的镜头\n不会用专业修图软件，只能做基础调整\n只有周末能出去拍，平时没时间',
  ),
)
eq('限制条数', ofdm.constraints.length, 3)
check('结尾保留了三个输出部分的要求', text.includes('下一步行动、需要的知识、可直接复制的执行指令'))

const emptyProject2 = {
  id: 'p_x',
  name: '空项目',
  category: '',
  description: '',
  status: 'idea',
  nextAction: '',
  constraints: [],
}
const emptyPrompt = buildProjectPrompt({
  project: emptyProject2,
  tasks: [],
  projectKnowledge: [],
  concepts: [],
})
check('没有描述时写「待补充」而不是编内容', emptyPrompt.text.includes(`项目目标：${PENDING}`))
check('没有下一步时写「待补充」', emptyPrompt.text.includes(`当前下一步行动：${PENDING}`))
check('没有任务时写「暂无任务」', emptyPrompt.text.includes('（暂无任务）'))
check('没有知识点时写「暂无」', emptyPrompt.text.includes('（暂无）'))
check('没有限制时写「待补充」', emptyPrompt.text.includes(`可使用的工具或限制：\n${PENDING}`))
check('空项目也不包含任何虚构的学校/专业信息', !/大学|学院|专业|年级/.test(emptyPrompt.text))

const promptOneLine = buildProjectPrompt({
  project: { ...emptyProject2, constraints: ['只有周末有时间'] },
  tasks: [],
  projectKnowledge: [],
  concepts: [],
})
check('单条限制也能正确填入', promptOneLine.text.includes('只有周末有时间'))

eq('变量提取', extractVariables('a {{x}} b {{ y }} c {{x}}').join(','), 'x,y')
eq('未知变量填占位', fillTemplate('值：{{nope}}', {}), `值：${PENDING}`)
eq('已知变量正常替换', fillTemplate('值：{{a}}', { a: '1' }), '值：1')

/* ---------- 8. 截止日期分级 ---------- */
group('截止日期')
function dateOffset(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
eq('没有截止日期', getDeadlineInfo(null).level, 'none')
eq('昨天 → 逾期', getDeadlineInfo(dateOffset(-1)).level, 'overdue')
eq('今天 → 紧急', getDeadlineInfo(dateOffset(0)).level, 'urgent')
eq('3 天后 → 紧急', getDeadlineInfo(dateOffset(3)).level, 'urgent')
eq('5 天后 → 临近', getDeadlineInfo(dateOffset(5)).level, 'soon')
eq('20 天后 → 正常', getDeadlineInfo(dateOffset(20)).level, 'normal')
eq('60 天后 → 不显示', getDeadlineInfo(dateOffset(60)).level, 'far')

/* ---------- 9. constraints 归一化 ---------- */
group('工具与限制')
eq('字符串按换行拆', normalizeConstraints('a\nb\n\nc').join(','), 'a,b,c')
eq('数组去空', normalizeConstraints(['a', '  ', 'b']).join(','), 'a,b')
eq('null 安全', normalizeConstraints(null).length, 0)
eq('粘贴多行会追加', addConstraint(['x'], 'y\nz').join(','), 'x,y,z')

/* ---------- 10. 持久化与导入导出 ---------- */
group('持久化与导入导出')
const exported = exportPayload(base)
eq('导出带上 schema 版本', exported.schemaVersion, 1)
check('导出带时间戳', typeof exported.exportedAt === 'string')

const roundTrip = normalizeState(JSON.parse(JSON.stringify(exported)))
eq('导出再导入项目数一致', roundTrip.projects.length, base.projects.length)
eq('导出再导入任务数一致', roundTrip.tasks.length, base.tasks.length)
eq('导出再导入概念数一致', roundTrip.knowledgeConcepts.length, base.knowledgeConcepts.length)
eq(
  '导出再导入关联数一致',
  roundTrip.projectKnowledge.length,
  base.projectKnowledge.length,
)

let threw = false
try {
  parseImport('这不是 JSON')
} catch {
  threw = true
}
check('损坏的 JSON 会被拒绝', threw)

threw = false
try {
  parseImport('[1,2,3]')
} catch {
  threw = true
}
check('数组顶层会被拒绝', threw)

threw = false
try {
  parseImport('null')
} catch {
  threw = true
}
check('null 会被拒绝', threw)

// 旧版扁平结构的升级
const legacy = normalizeState({
  schemaVersion: 1,
  projects: base.projects,
  tasks: [],
  knowledgeItems: [
    {
      id: 'k1',
      projectId: 'p_photo',
      title: '旧版知识点',
      category: '编程',
      reasonNeeded: '为什么需要',
      status: 'learning',
      estimatedMinutes: 30,
      resourceLinks: [{ label: '资料', url: 'https://example.com' }],
      blocksProject: true,
      notes: '',
    },
  ],
})
eq('旧结构升格出 1 个概念', legacy.knowledgeConcepts.length, 1)
eq('旧结构升格出 1 条关联', legacy.projectKnowledge.length, 1)
eq('概念名取自 title', legacy.knowledgeConcepts[0].name, '旧版知识点')
eq('默认资源继承 resourceLinks', legacy.knowledgeConcepts[0].defaultResources.length, 1)
check('阻塞标记被保留', legacy.projectKnowledge[0].blocksProject === true)
check('升格后不再保留 knowledgeItems', legacy.knowledgeItems === undefined)

// localStorage 往返
writeMirror(base)
const reloaded = readMirror()
eq('写进 localStorage 再读出来项目数一致', reloaded.projects.length, base.projects.length)

writeMeta({ syncedRevision: 12, lastSaveAt: '2026-09-15T10:00:00.000Z' })
const meta = readMeta()
eq('meta 能读回同步版本号', meta.syncedRevision, 12)
eq('meta 保留最后写入时间', meta.lastSaveAt, '2026-09-15T10:00:00.000Z')
eq('meta 没有 lastSaveError', meta.lastSaveError, null)

// 「还没接 AI」那条引导横幅的关闭状态。没存过时必须是 false ——
// 存过才沉默，否则第一次打开的人根本看不到引导。
eq('没关过横幅时是 false', readAiBannerDismissed(), false)
writeAiBannerDismissed(true)
eq('关掉之后记得住', readAiBannerDismissed(), true)
// 配好 key 要让它重新出现，所以必须能清掉
writeAiBannerDismissed(false)
eq('清掉之后回到 false', readAiBannerDismissed(), false)

const summary = summarize(base)
eq('摘要统计项目数', summary.projects, 3)
eq('摘要统计概念数', summary.concepts, 11)

/* ---------- 11. 版本号 ---------- */
group('版本号')
eq('空状态版本号是 0', base.revision, 0)

const bumped = reducer(base, { type: 'SETTINGS_UPDATE', patch: { theme: 'dark' } })
eq('改一次版本号 +1', bumped.revision, 1)

const bumpedTwice = reducer(bumped, { type: 'TASK_CREATE', task: { id: 'x', projectId: 'p_photo' } })
eq('再改一次 +2', bumpedTwice.revision, 2)

const noop = reducer(bumped, { type: 'UNKNOWN_ACTION' })
check('没有变化时返回同一个对象，版本号不动', noop === bumped)

const adopted = reducer(bumped, { type: 'DATA_REPLACE', state: { ...base, revision: 42 } })
eq('采纳外部状态时保留它自己的版本号', adopted.revision, 42)

/* ---------- 12. 启动决策 ---------- */
group('启动决策')
const mirrorState = { ...base, revision: 7 }
const diskState = { ...base, revision: 5 }
const diskHit = (rev, extra = {}) => ({ ok: true, exists: true, state: { ...base, revision: rev }, revision: rev, ...extra })

let d = decideBoot({ disk: { ok: false, code: 'NETWORK' }, mirror: mirrorState, meta: { syncedRevision: 5 } })
eq('服务器不可用 → 用镜像', d.reason, BOOT_REASONS.OFFLINE)
eq('服务器不可用时给出镜像数据', d.state.revision, 7)
eq('服务器不可用时标记为不可用', d.diskAvailable, false)

d = decideBoot({ disk: { ok: false, code: 'NETWORK' }, mirror: null, meta: null })
eq('服务器不可用且没有镜像', d.reason, BOOT_REASONS.OFFLINE_EMPTY)
eq('两边都没有时 state 为空', d.state, null)

d = decideBoot({ disk: { ok: true, exists: false, revision: 0 }, mirror: mirrorState, meta: { syncedRevision: 7 } })
eq('磁盘还没有文件 → 迁移', d.reason, BOOT_REASONS.MIGRATED)
eq('迁移时用镜像的数据', d.state.revision, 7)
check('迁移后需要推一次', d.pending === true)

d = decideBoot({ disk: { ok: true, exists: false, revision: 0 }, mirror: null, meta: null })
eq('两边都空 → 全新开始', d.reason, BOOT_REASONS.FRESH)

d = decideBoot({ disk: diskHit(5), mirror: null, meta: null })
eq('浏览器数据被清了 → 用磁盘', d.reason, BOOT_REASONS.MIRROR_LOST)
eq('从磁盘恢复数据', d.state.revision, 5)

d = decideBoot({ disk: diskHit(5), mirror: mirrorState, meta: { syncedRevision: 5 } })
eq('镜像更新 → 要询问', d.reason, BOOT_REASONS.LOCAL_AHEAD)
eq('询问期间先显示磁盘版本', d.state.revision, 5)
eq('把镜像版本带出来给恢复用', d.local.revision, 7)
eq('磁盘版本号', d.diskRevision, 5)
eq('镜像版本号', d.mirrorRevision, 7)
check('询问期间写入要挂起', d.pending === true)
check('询问结果里带磁盘状态', d.diskState.revision === 5)

d = decideBoot({ disk: diskHit(9), mirror: mirrorState, meta: { syncedRevision: 7 } })
eq('磁盘更新 → 用磁盘', d.reason, BOOT_REASONS.DISK_NEWER)
eq('采用磁盘版本', d.state.revision, 9)

d = decideBoot({ disk: diskHit(7), mirror: mirrorState, meta: { syncedRevision: 7 } })
eq('版本一致 → 已同步', d.reason, BOOT_REASONS.IN_SYNC)
eq('用磁盘版本', d.state.revision, 7)

d = decideBoot({
  disk: { ok: true, exists: false, corrupt: 'Unexpected token', preservedAt: 'data.corrupt.json', revision: 0 },
  mirror: mirrorState,
  meta: { syncedRevision: 5 },
})
eq('磁盘文件损坏 → 提示', d.reason, BOOT_REASONS.DISK_CORRUPT)
eq('损坏时退回镜像', d.state.revision, 7)
eq('带出另存的位置', d.preservedAt, 'data.corrupt.json')

d = decideBoot({
  disk: { ok: true, exists: false, corrupt: 'x', revision: 0 },
  mirror: null,
  meta: null,
})
eq('损坏且没有镜像 → 只能是空', d.state, null)
check('损坏时不算离线', d.diskAvailable === true)

/* ---------- 13. 磁盘文件读写 ---------- */
group('磁盘文件读写')
const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const nodePath = await import('node:path')

const tmp = mkdtempSync(nodePath.join(tmpdir(), 'aiwb-test-'))
process.env.AIWB_DATA_DIR = tmp
const store2 = await import(`../server/lib/dataStore.js?t=${tmp}`)

eq('一开始没有文件', store2.readData().exists, false)
eq('没有文件时版本号是 0', store2.readData().revision, 0)

const written = store2.writeData({ ...base, revision: 3 }, 3)
eq('写入后版本号正确', written.revision, 3)
check('返回写入字节数', written.bytes > 0)

const back = store2.readData()
eq('读回来 exists 为真', back.exists, true)
eq('读回来版本号一致', back.revision, 3)
eq('读回来项目数一致', back.state.projects.length, 3)
check('savedAt 没有混进 state', back.state.savedAt === undefined)
check('磁盘文件确实存在', existsSync(nodePath.join(tmp, 'data.json')))

store2.writeData({ ...base, revision: 4 }, 4)
check('第二次写入生成了备份', existsSync(nodePath.join(tmp, 'data.backup.json')))
const backup = JSON.parse(readFileSync(nodePath.join(tmp, 'data.backup.json'), 'utf8'))
eq('备份里是上一版', backup.revision, 3)

// 写坏文件，确认不覆盖而是另存
writeFileSync(nodePath.join(tmp, 'data.json'), '{ 这不是合法 JSON', 'utf8')
const corruptRead = store2.readData()
check('损坏文件被识别出来', Boolean(corruptRead.corrupt))
eq('损坏时 exists 为假', corruptRead.exists, false)
check('损坏的原始内容被另存', existsSync(nodePath.join(tmp, 'data.corrupt.json')))
eq(
  '另存的内容和原始一致',
  readFileSync(nodePath.join(tmp, 'data.corrupt.json'), 'utf8'),
  '{ 这不是合法 JSON',
)

rmSync(tmp, { recursive: true, force: true })
delete process.env.AIWB_DATA_DIR

/* ---------- 14. 服务不可达的识别 ---------- */
group('服务不可达 vs 服务报错')
const { get, isServiceOffline } = await import('../src/api/client.js')

// 接口挂掉时 Vite 代理实测返回的是 500 + text/plain
check('代理返回 text/plain 500 → 离线', isServiceOffline(500, 'text/plain'))
check('代理返回 text/html 500 → 离线', isServiceOffline(500, 'text/html'))
check('502 网关错误 → 离线', isServiceOffline(502, 'text/html'))
check('503 → 离线', isServiceOffline(503, ''))
check('504 → 离线', isServiceOffline(504, 'application/json'))
check('正常 JSON 200 → 不是离线', !isServiceOffline(200, 'application/json'))
check(
  '接口自己的 JSON 500 → 不是离线',
  !isServiceOffline(500, 'application/json; charset=utf-8'),
)
check('缺少 Content-Type → 当作离线', isServiceOffline(200, undefined))

// 走一遍真实的请求路径
const realFetch = globalThis.fetch

globalThis.fetch = async () => ({
  status: 500,
  ok: false,
  headers: { get: () => 'text/plain' },
  json: async () => {
    throw new SyntaxError('Unexpected token <')
  },
})
const offlineRes = await get('/api/data')
eq('代理错误页 → SERVICE_OFFLINE', offlineRes.code, 'SERVICE_OFFLINE')
check('不再报成解析错误', !String(offlineRes.message).includes('非 JSON'))

globalThis.fetch = async () =>
  new Response(JSON.stringify({ ok: false, code: 'WRITE_FAILED', message: '磁盘写满了' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
const jsonErrRes = await get('/api/data')
eq('接口自己的 JSON 错误照常透出', jsonErrRes.code, 'WRITE_FAILED')

globalThis.fetch = async () => new Response('{"ok":true,"value":7}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})
const okRes = await get('/api/data')
check('正常响应能解析', okRes.ok === true && okRes.value === 7)

globalThis.fetch = async () => {
  throw new TypeError('fetch failed')
}
const netRes = await get('/api/data')
eq('连接被拒 → NETWORK', netRes.code, 'NETWORK')

globalThis.fetch = realFetch

/* ---------- 15. 真实模型接入 ---------- */
group('知识点建议的结构化输出')
const { AI_CATEGORIES, KNOWLEDGE_SUGGESTION_SCHEMA, MAX_ITEMS, normalizeItems } = await import(
  '../server/lib/ai/schema.js'
)
const { KNOWLEDGE_CATEGORIES } = await import('../src/data/options.js')

// 结构化输出要求每个 object 都写 additionalProperties: false，漏了会被接口拒绝
function assertStrictObjects(node, pathLabel, problems) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'object') {
    if (node.additionalProperties !== false) {
      problems.push(`${pathLabel} 缺少 additionalProperties: false`)
    }
    for (const [key, child] of Object.entries(node.properties || {})) {
      assertStrictObjects(child, `${pathLabel}.${key}`, problems)
    }
  }
  if (node.type === 'array') {
    assertStrictObjects(node.items, `${pathLabel}[]`, problems)
  }
}

const schemaProblems = []
assertStrictObjects(KNOWLEDGE_SUGGESTION_SCHEMA, 'root', schemaProblems)
eq('schema 里所有 object 都标了 additionalProperties', schemaProblems.join('；'), '')

check('顶层是 object', KNOWLEDGE_SUGGESTION_SCHEMA.type === 'object')
check('items 是数组', KNOWLEDGE_SUGGESTION_SCHEMA.properties.items.type === 'array')
check(
  '每个条目都要求四个字段',
  ['name', 'category', 'reasonNeeded', 'estimatedMinutes'].every((k) =>
    KNOWLEDGE_SUGGESTION_SCHEMA.properties.items.items.required.includes(k),
  ),
)

eq('服务端分类与前端分类没有漂移', AI_CATEGORIES.join(','), KNOWLEDGE_CATEGORIES.join(','))

group('模型返回结果的清洗')
eq('正常条目原样保留', normalizeItems({ items: [{ name: 'Git', category: '编程', reasonNeeded: 'r', estimatedMinutes: 60 }] }).length, 1)
eq('名字为空的丢掉', normalizeItems({ items: [{ name: '  ', category: '编程' }] }).length, 0)
eq(
  '同名去重（忽略大小写）',
  normalizeItems({
    items: [
      { name: 'Git', category: '编程', estimatedMinutes: 10 },
      { name: 'git', category: '编程', estimatedMinutes: 20 },
    ],
  }).length,
  1,
)
eq(
  '不认识的分类归到「其他」',
  normalizeItems({ items: [{ name: 'x', category: '量子力学', estimatedMinutes: 5 }] })[0].category,
  '其他',
)
eq(
  '时长不是数字时置空',
  normalizeItems({ items: [{ name: 'x', category: '编程', estimatedMinutes: 'abc' }] })[0]
    .estimatedMinutes,
  null,
)
eq(
  '负时长置空',
  normalizeItems({ items: [{ name: 'x', category: '编程', estimatedMinutes: -5 }] })[0]
    .estimatedMinutes,
  null,
)
eq(
  '超量会被截断到上限',
  normalizeItems({
    // 比上限多给一些，确认是被截断而不是原样返回
    items: Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({
      name: `k${i}`,
      category: '编程',
      estimatedMinutes: 10,
    })),
  }).length,
  MAX_ITEMS,
)
check('上限本身够宽（按步骤生成十几条是常态）', MAX_ITEMS >= 20)
eq('items 不是数组时返回空', normalizeItems({ items: 'nope' }).length, 0)
eq('null 安全', normalizeItems(null).length, 0)

group('AI 配置与回退')
const { mkdtempSync: mkTmp2, rmSync: rmTmp2 } = await import('node:fs')
const { tmpdir: tmp2 } = await import('node:os')
const nodePath2 = await import('node:path')
const cfgDir = mkTmp2(nodePath2.join(tmp2(), 'aiwb-ai-'))
process.env.AIWB_CONFIG_DIR = cfgDir
delete process.env.ANTHROPIC_API_KEY

const ai = await import(`../server/lib/ai/index.js?t=${cfgDir}`)

let aiStatus = ai.getAiStatus()
check('没配 key 时是未配置', aiStatus.configured === false)
eq('默认模型是 Opus 4.8', aiStatus.model, 'claude-opus-4-8')
eq('没配时来源为空', aiStatus.source, null)
eq('没配时没有 key 提示', aiStatus.keyHint, null)

const fallback = await ai.suggestKnowledge({ projectName: '街拍摄影作业', category: '课程作业', description: '拍一组照片交作业' })
eq('未配置时走模拟数据', fallback.source, 'mock')
check('模拟数据有内容', fallback.items.length > 0)
check('提示里说明了现在是模拟', String(fallback.notice).includes('模拟'))

const { updateAiConfig, readAiConfig } = await import(`../server/lib/config.js?t=${cfgDir}`)
const FULL_FAKE_KEY = 'sk-ant-api03-THIS-IS-A-FAKE-KEY-for-testing-1234'
updateAiConfig({ apiKey: FULL_FAKE_KEY })
aiStatus = ai.getAiStatus()
check('配了 key 之后变成已配置', aiStatus.configured === true)
eq('来源标为 config', aiStatus.source, 'config')
check('keyHint 只露头尾', aiStatus.keyHint.startsWith('sk-ant-') && aiStatus.keyHint.endsWith('1234'))
check('keyHint 不含中间部分', !aiStatus.keyHint.includes('FAKE-KEY'))

// 「key 不出进程」这条红线，光靠「记得查一下」守不住 —— 这里改成结构白名单：
// 任何新增字段都必须先在这一行被审过，否则测试红。
const EXPECTED_AI_STATUS_KEYS = [
  'baseUrl',
  'compatMode',
  'configured',
  'defaultBaseUrl',
  'keyHint',
  'model',
  'providerId',
  'source',
]
check('状态里根本没有 apiKey 这个键', !('apiKey' in aiStatus))
check('状态里没有完整 key', !JSON.stringify(aiStatus).includes(FULL_FAKE_KEY))
eq(
  '状态字段是白名单内的（加字段前先想清楚会不会带出 key）',
  Object.keys(aiStatus).sort().join(','),
  [...EXPECTED_AI_STATUS_KEYS].sort().join(','),
)

group('凭据来源的优先级')
updateAiConfig({ apiKey: '' })
process.env.ANTHROPIC_API_KEY = 'sk-ant-env-ONLY-FROM-ENVIRONMENT-9999'
const envOnly = ai.getAiStatus()
eq('只有环境变量时标为 env', envOnly.source, 'env')
check('环境变量也算已配置', envOnly.configured === true)

updateAiConfig({ apiKey: FULL_FAKE_KEY })
const both = ai.getAiStatus()
eq('两边都有时配置文件优先', both.source, 'config')
check('keyHint 来自配置文件那把', both.keyHint.endsWith('1234'))
delete process.env.ANTHROPIC_API_KEY

group('供应商预设')
const {
  PROVIDERS,
  matchProvider,
  unreachableMessage,
  DEFAULT_BASE_URL: PBASE,
} = await import('../server/lib/ai/providers.js')

const presetIds = PROVIDERS.map((p) => p.id)
eq('id 不重复', new Set(presetIds).size, presetIds.length)
check('每条都有给人看的名字', PROVIDERS.every((p) => typeof p.label === 'string' && p.label.trim()))
check('预设表里不含凭据', !/sk-[A-Za-z0-9_-]{8,}/.test(JSON.stringify(PROVIDERS)))

// 把 README 里那条规则「官方端点不要开兼容模式」编码成断言
const official = PROVIDERS.filter((p) => p.baseUrl === '')
check('官方那条不开兼容模式', official.length > 0 && official.every((p) => p.compatMode === false))
const thirdParty = PROVIDERS.filter((p) => typeof p.baseUrl === 'string' && p.baseUrl)
check(
  '填了具体端点的那几条一定开兼容模式',
  thirdParty.every((p) => p.compatMode === true),
  thirdParty.map((p) => `${p.id}:${p.compatMode}`).join(','),
)
check('具体端点一律 https', thirdParty.every((p) => p.baseUrl.startsWith('https://')))
// null 和 '' 在这里含义完全不同：'' 会把端点悄悄改回官方
eq('「自定义端点」不预填地址（null，不是空串）', PROVIDERS.find((p) => p.id === 'custom')?.baseUrl, null)

eq('空端点反推成官方', matchProvider('').id, 'anthropic')
eq('没设端点也反推成官方', matchProvider(null).id, 'anthropic')
eq('认不出来的端点归到自定义', matchProvider('https://example.com/v1').id, 'custom')
eq('命中预设时忽略尾斜杠', matchProvider('https://api.deepseek.com/anthropic/').id, 'deepseek')
eq('命中预设时忽略大小写', matchProvider('HTTPS://API.DEEPSEEK.COM/anthropic').id, 'deepseek')

// 接第三方端点时，写死 api.anthropic.com 的报错会让人完全摸不着头脑
const offlineMsg = unreachableMessage('https://my-proxy.example.com', new Error('ECONNREFUSED'))
check('「连不上」指向用户真正配的端点', offlineMsg.includes('https://my-proxy.example.com'))
check('不再写死官方地址', !offlineMsg.includes('api.anthropic.com'))
check('没配端点时才说官方地址', unreachableMessage('', new Error('x')).includes(PBASE))

// 「预设只是填充器」的守护：存储结构不该因为预设而变胖。
// 哪天有人把预设接成真源、往 ai 里塞 providerId，这条会红，逼他回来补迁移和文档。
eq(
  '存储的 ai 字段没被预设撑大',
  Object.keys(readAiConfig()).sort().join(','),
  ['apiKey', 'baseUrl', 'compatMode', 'model'].join(','),
)

rmTmp2(cfgDir, { recursive: true, force: true })
delete process.env.AIWB_CONFIG_DIR

/* ---------- 汇总 ---------- */
console.log(lines.join('\n'))
console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail > 0 ? 1 : 0)
