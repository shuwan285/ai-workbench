import Anthropic from '@anthropic-ai/sdk'
import {
  KNOWLEDGE_SUGGESTION_SCHEMA,
  MAX_ITEMS,
  MAX_STEPS,
  MIN_ITEMS,
  MIN_STEPS,
  PLAN_REVIEW_SCHEMA,
  PROJECT_PLAN_SCHEMA,
  STEP_ASSIGNMENT_SCHEMA,
  knowledgeShortfall,
  normalizeAssignments,
  normalizeGaps,
  normalizeItems,
  normalizeSteps,
  planShortfall,
} from './schema.js'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, unreachableMessage } from './providers.js'

// 默认模型与默认端点的唯一出处是 providers.js，这里转发出去保持原有导入面。
//
// 端点只由应用自己的配置决定，不读环境变量里的 ANTHROPIC_BASE_URL：
// 很多人为了别的工具在 shell 里设了代理，本应用从那个 shell 启动时会被一并带偏 ——
// 请求悄悄发去第三方端点，报错信息还看不出是为什么。要代理就显式填在设置页里。
export { DEFAULT_BASE_URL, DEFAULT_MODEL }

// 单位是毫秒（TypeScript SDK 和 Python 不一样）。
// 配合 maxRetries=1，最坏情况约 90 秒，本地界面等得起但不会无限挂住。
const TIMEOUT_MS = 45_000
const MAX_RETRIES = 1

const SYSTEM_PROMPT = `你是一个学习规划助手。使用者会给你一个正在进行中的项目，
以及他打算按顺序做的几步 —— 每步都写了「要做什么」。

你要回答的是：**为了把这几步做下去，每一步他需要先掌握什么。**

要求：
- **以步骤为纲**：对着每一步的「要做什么」问「不会什么就动不了手」，然后列出来。
  别按项目主题泛泛地想，要贴着那一步的具体动作
- **具体到能照着做**。写「逆光拍人时把测光点放在脸上」，不要写「摄影用光」；
  写「一组照片调色时先统一白平衡再动饱和度」，不要写「照片后期」；
  写「按场景给照片分组、再看能不能连成一条线」，不要写「图片管理」。
  宁细勿粗 —— 一条只解决一件事。话题式的大词对做不下去的人没有用
- **给出的每一步都必须有**。交之前自己检查一遍：上面列的那些步骤里，有没有哪一步
  一条都没分到？有的话补上。使用者做到那一步会直接卡住，这正是他要这个清单的原因
- 条数：每步 1–3 条，**总数不少于 ${MIN_ITEMS} 条**（一般 ${MIN_ITEMS}–${MAX_ITEMS} 条）。
  宁可细，不要粗 —— 一条只解决一件事。步骤多的时候条数自然就多，别压
- 只列需要现学的，不要把「做这一步」本身当成知识点
- reasonNeeded 要说清「不学它，这一步会卡在哪个具体动作上」，不要写「这很重要」这类套话
- estimatedMinutes 是从零到能用的估计时长，取整数分钟
- 每条都要判断「最晚在哪一步动手之前补掉它」，把那一步方括号里的 id 填进 stepId。
  **只能填给出的 id，不要自己编**；跟任何一步都不沾边就填空字符串
- 如果某条跟这个项目没关系（换成别的项目也照样成立的套话），unrelated 填 true、stepId 留空。
  但不要拿这个当省事的借口 —— 每一步真正需要的东西还是要给
- 项目说明或步骤里没提到的方向不要猜；信息不够就少列几条，不要编

如果使用者**还没拆出步骤**，那就退回到按项目本身判断：完成这个项目需要先补哪些基础知识。
这种情况下按「不补就会卡住」的程度从高到低排，列 ${MIN_ITEMS} 到 ${MAX_ITEMS} 条。`

// 客户端按「key + 端点」缓存。任一变化就重建，避免拿着旧配置发请求。
let cached = null
let cachedKey = null

function getClient(apiKey, baseUrl) {
  const key = apiKey || undefined
  const base = baseUrl || DEFAULT_BASE_URL
  if (!cached || cachedKey !== `${key}|${base}`) {
    cached = new Anthropic({
      apiKey: key, // 传 undefined 时 SDK 会自己读 ANTHROPIC_API_KEY
      // 显式置空，压掉环境变量里的 ANTHROPIC_AUTH_TOKEN。
      // 否则它和 apiKey 会一起被发出去，接口直接拒绝。
      authToken: null,
      baseURL: base,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    })
    cachedKey = `${key}|${base}`
  }
  return cached
}

/* ---------- 兼容模式 ---------- */

// 官方端点用 output_config 保证「返回的就是符合 schema 的 JSON」。
// 很多第三方兼容端点会**默默忽略**这个字段，然后回一大段散文 ——
// 结果就是 JSON.parse 直接抛，报错还看不出原因。
// 兼容模式下改成：把要的形状写进提示词，自己从返回里挖 JSON。
// 代价是没了硬保证，所以宁可宽松一点解析，也别动不动就失败。

function typeName(schema) {
  if (!schema) return 'any'
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => `"${v}"`).join(' | ')
  if (schema.type === 'array') return `[${typeName(schema.items)}]`
  if (schema.type === 'object') {
    const inner = Object.entries(schema.properties || {})
      .map(([k, v]) => `${k}: ${typeName(v)}`)
      .join(', ')
    return `{ ${inner} }`
  }
  return schema.type === 'integer' ? 'number' : schema.type
}

export function schemaInstruction(schema) {
  const lines = [
    '',
    '---',
    '严格只输出一个 JSON 对象：不要解释、不要开场白、不要用 markdown 代码块包裹。',
    '结构如下，字段名照抄，不要增删字段：',
    typeName(schema),
  ]

  const fields = []
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node.properties || {})) {
      const full = path ? `${path}.${key}` : key
      if (value.description) fields.push(`- ${full}：${value.description}`)
      if (value.type === 'object') walk(value, full)
      else if (value.type === 'array' && value.items?.type === 'object') walk(value.items, `${full}[]`)
    }
  }
  walk(schema, '')

  if (fields.length > 0) {
    lines.push('', '各字段的含义：', ...fields)
  }
  return lines.join('\n')
}

// 从第一个 { 开始配对扫描，扫到深度归零为止。
// 不能简单地取「第一个 { 到最后一个 }」—— 模型经常在 JSON 后面又补一段话
// 或再举个例子，那样会多挖一大截，JSON.parse 直接失败。
function extractBalanced(text) {
  const start = text.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

// 有些模型会漏掉键名的引号，回成 JavaScript 对象字面量的样子：{verdict: "..."}。
// 这不是合法 JSON，但意图毫无歧义。逐字符走一遍、跳过字符串内部，
// 免得把值里的 "{a: 1}" 也一起改掉。只在严格解析已经失败之后才用得上。
export function quoteBareKeys(text) {
  let out = ''
  let inString = false
  let escaped = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      i += 1
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      i += 1
      continue
    }

    // 键名只可能紧跟在 { 或 , 后面
    if (ch === '{' || ch === ',') {
      out += ch
      i += 1
      while (i < text.length && /\s/.test(text[i])) {
        out += text[i]
        i += 1
      }
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i))
      if (m) {
        let j = i + m[0].length
        while (j < text.length && /\s/.test(text[j])) j += 1
        // 后面跟冒号才是键名；是值的话（比如数组里的裸字符串）不动它
        if (text[j] === ':') {
          out += `"${m[0]}"`
          i += m[0].length
          continue
        }
      }
      continue
    }

    out += ch
    i += 1
  }

  return out
}

// 从可能带前后文的返回里把 JSON 挖出来
export function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('模型没有返回内容')

  // 带围栏的优先，因为模型十有八九会把 JSON 包在 ``` 里
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = fenced ? [fenced[1].trim(), raw] : [raw]

  for (const body of candidates) {
    try {
      return JSON.parse(body)
    } catch {
      // 继续往下试
    }
    const extracted = extractBalanced(body)
    if (extracted) {
      try {
        return JSON.parse(extracted)
      } catch {
        // 严格解析没过，试一下补键名引号。实测 deepseek-chat 会有这个毛病，
        // 不补的话整条路径都会退回模拟数据 —— 明明内容是完全可用的。
        try {
          const quoted = quoteBareKeys(extracted)
          if (quoted !== extracted) return JSON.parse(quoted)
        } catch {
          // 继续往下试
        }
      }
    }
  }

  throw new Error('找不到合法的 JSON')
}

function buildRequest({ model, system, schema, userContent, maxTokens, compat }) {
  if (compat) {
    return {
      model,
      max_tokens: maxTokens,
      system: `${system}\n${schemaInstruction(schema)}`,
      messages: [{ role: 'user', content: userContent }],
    }
  }
  return {
    model,
    max_tokens: maxTokens,
    system,
    // 自适应思考。Opus 4.8 上不显式打开就是不思考。
    thinking: { type: 'adaptive' },
    output_config: {
      format: { type: 'json_schema', schema },
      effort: 'medium',
    },
    messages: [{ role: 'user', content: userContent }],
  }
}

// 四条 AI 路径共用的调用 + 解析。差异只有提示词和 schema。
async function callOnce({ apiKey, baseUrl, compat, model, system, schema, userContent, maxTokens }) {
  const client = getClient(apiKey, baseUrl)

  let response
  try {
    response = await client.messages.create(
      buildRequest({ model, system, schema, userContent, maxTokens, compat }),
    )
  } catch (err) {
    const info = classify(err, baseUrl)
    const wrapped = new Error(info.message)
    wrapped.code = info.code
    throw wrapped
  }

  // 读 content 之前先看 stop_reason，被拒时 content 可能是空的
  if (response.stop_reason === 'refusal') {
    const err = new Error('模型拒绝了这个请求')
    err.code = 'AI_REFUSED'
    throw err
  }
  if (response.stop_reason === 'max_tokens') {
    const err = new Error('输出被截断了，JSON 不完整')
    err.code = 'AI_TRUNCATED'
    throw err
  }

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  let parsed
  try {
    parsed = compat ? parseJsonLoose(text) : JSON.parse(text)
  } catch {
    // 把开头截一段带上：不然这种错在界面上只有一个「不是合法 JSON」，
    // 完全无从下手。用兼容模式接第三方端点时尤其需要。
    const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 180)
    const err = new Error(
      snippet ? `模型返回的内容不是合法 JSON。开头是：${snippet}` : '模型返回的内容是空的',
    )
    err.code = 'AI_BAD_JSON'
    throw err
  }

  return {
    parsed,
    usage: {
      input: response.usage?.input_tokens ?? null,
      output: response.usage?.output_tokens ?? null,
    },
    model: response.model,
  }
}

// 生成结果不达标（步数太少、某一步一条知识点都没有……）就把「缺什么」
// 原样告诉模型，再要一次。与其让使用者做到那一步才发现没东西可学，
// 不如多花一次调用 —— 这是「不能过少」唯一能落地的办法，光在提示词里
// 写「别给太少」模型是会偷懒的。
async function callForJson({ repair, ...args }) {
  const first = await callOnce(args)
  if (!repair) return first

  const problem = repair(first.parsed)
  if (!problem) return first

  const second = await callOnce({
    ...args,
    userContent: `${args.userContent}\n\n---\n上一版不合格：${problem}。\n请重新给一份完整、够细的，该有的都要有，不要省略。`,
  })

  // 重试过还差就把差在哪带上去，上层如实告诉使用者（不假装完整）
  return { ...second, retried: true, shortfall: repair(second.parsed) }
}

function buildUserPrompt({ projectName, category, description, tasks = [] }) {
  const lines = ['我这个项目要往下做，帮我看看每一步需要先会什么。', '']
  lines.push(`项目名称：${projectName || '（未填）'}`)
  lines.push(`项目类别：${category || '（未填）'}`)
  lines.push(`项目描述：${description || '（未填）'}`)

  if (tasks.length > 0) {
    lines.push('')
    lines.push('我打算按这个顺序做，每一步都写了要做什么：')
    for (const [i, t] of tasks.entries()) {
      lines.push('')
      lines.push(`${i + 1}. [${t.id}] ${t.title}`)
      // 把说明也带上 —— 知识点要贴着具体动作，光看标题只能想出话题式的大词
      if (t.description) lines.push(`   要做什么：${t.description}`)
      if (t.doneWhen) lines.push(`   算完成：${t.doneWhen}`)
    }
    lines.push('')
    lines.push('请对着每一步的「要做什么」，列出做它之前需要先掌握的东西，填上对应的 stepId。')
  } else {
    lines.push('')
    lines.push('这个项目还没拆出步骤，所以 stepId 一律填空字符串。')
  }

  return lines.join('\n')
}

// 「把这些已有的知识点排到各步」用的提示词。和生成那条的区别是：
// 这里不产出新知识点，只对给定的一批做归属判断。
const ASSIGN_SYSTEM_PROMPT = `你是一个学习规划助手。使用者手头有一个项目，
已经拆成了按顺序执行的几步，也已经攒了一批要补的知识点。
你要判断每条知识点「最晚在哪一步动手之前要补掉」。

要求：
- stepId 只能填任务列表里方括号给出的 id，不要自己编
- 每一步只放真正需要它的知识点，不要为了填满硬塞
- 如果某条跟这个项目本身没关系（换成别的项目也照样成立的套话），unrelated 填 true、stepId 留空
- reason 用一句话说清为什么排在这一步，要落到这个项目上，不要写通用套话
- 每条都要给出一条记录，不要漏`

function buildAssignUserPrompt({ projectName, description, tasks = [], knowledge = [] }) {
  const lines = [`项目：${projectName || '（未填）'}`, `说明：${description || '（未填）'}`, '']

  lines.push('按顺序执行的步骤：')
  if (tasks.length === 0) lines.push('（还没有拆出步骤）')
  for (const [i, t] of tasks.entries()) {
    lines.push(`${i + 1}. [${t.id}] ${t.title}`)
  }

  lines.push('')
  lines.push('要补的知识点：')
  for (const k of knowledge) {
    lines.push(`- [${k.conceptId}] ${k.name}${k.reasonNeeded ? ` —— ${k.reasonNeeded}` : ''}`)
  }

  return lines.join('\n')
}

// 把 SDK 的各种异常归成前端能直接照做的错误码。
// 带 baseUrl 是为了让「连不上」指向用户实际配的那个端点，不是官方的。
function classify(err, baseUrl) {
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: 'AI_BAD_KEY', message: 'API key 无效或已失效' }
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    // 403 有两种可能：key 本身是无效的，或者 key 有效但没这个模型的权限
    return { code: 'AI_FORBIDDEN', message: 'key 无效，或者它没有调用该模型的权限' }
  }
  if (err instanceof Anthropic.NotFoundError) {
    return {
      code: 'AI_MODEL_NOT_FOUND',
      message: '端点返回 404 —— 模型 ID 不对、账号用不了它，或者端点地址填错了',
    }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: 'AI_RATE_LIMIT', message: '触发了频率限制，等一会儿再试' }
  }
  // APIConnectionError 是 APIError 的子类，必须先判
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: 'AI_UNREACHABLE', message: unreachableMessage(baseUrl, err) }
  }
  if (err instanceof Anthropic.APIError) {
    return { code: 'AI_ERROR', message: `接口返回 ${err.status}：${err.message}` }
  }
  return { code: 'AI_ERROR', message: err?.message || '未知错误' }
}

export async function suggestWithClaude(payload, { apiKey, model = DEFAULT_MODEL, baseUrl, compat } = {}) {
  const tasks = payload.tasks || []

  const result = await callForJson({
    apiKey,
    baseUrl,
    compat,
    model,
    system: SYSTEM_PROMPT,
    schema: KNOWLEDGE_SUGGESTION_SCHEMA,
    userContent: buildUserPrompt(payload),
    maxTokens: 16000,
    // 给少了就把「哪几步一条都没有」原样告诉它，再要一次
    repair: (parsed) => knowledgeShortfall(normalizeItems(parsed, tasks), tasks),
  })

  // 模型可能编出列表里没有的 stepId，这里拿真实任务 id 过一遍
  const items = normalizeItems(result.parsed, tasks)
  if (items.length === 0) {
    const err = new Error('模型没有给出可用的知识点')
    err.code = 'AI_EMPTY'
    throw err
  }

  return { items, usage: result.usage, model: result.model, shortfall: result.shortfall || null }
}

export async function assignKnowledgeSteps(payload, { apiKey, model = DEFAULT_MODEL, baseUrl, compat } = {}) {
  const tasks = payload.tasks || []
  const knowledge = payload.knowledge || []

  const result = await callForJson({
    apiKey,
    baseUrl,
    compat,
    model,
    system: ASSIGN_SYSTEM_PROMPT,
    schema: STEP_ASSIGNMENT_SCHEMA,
    userContent: buildAssignUserPrompt({ ...payload, tasks, knowledge }),
    maxTokens: 8000,
  })

  return {
    assignments: normalizeAssignments(result.parsed, knowledge, tasks),
    usage: result.usage,
    model: result.model,
  }
}

// 把项目拆成能照着做的几步。每步都要有「要做什么」和「算完成」。
const PLAN_SYSTEM_PROMPT = `你是一个项目执行规划助手。使用者会给你一个项目，
你要把它拆成按顺序执行的几步 —— 让人照着就能一步步做完。

要求：
- **这几步合起来必须能覆盖整个项目**，不能只有中间那几段。至少要有：
  ① 搞清楚最终要交出什么（交付物、格式、验收标准）
  ② 动手前的准备（环境、素材、数据、资料）
  ③ 主体工作 —— 拆成能各自独立开工的几块，别揉成一大步
  ④ 自己验证结果对不对
  ⑤ 整理成交付物
- **步数不少于 ${MIN_STEPS} 步**（一般 ${MIN_STEPS}–${MAX_STEPS} 步）。宁可细，不要粗：
  一步太大，使用者做到那里会不知道从哪下手。该拆成两步的就拆成两步
- title 是一行短标题；description 写清**具体要做什么**，细到能照着动手；
  doneWhen 写清**做到什么程度算完成**，要能判断「完了没有」
- description 和 doneWhen 都要落到这个项目上。提到工具、材料、产出物时用**这个项目里
  实际的名字**（「把相机的光圈快门各拨一遍」），不要写「准备好工具」这种放到哪都成立的泛称
- 只列要动手做的事，不要把「要补什么知识」写进来 —— 那是另一件事
- 项目描述没提到的方向不要猜；信息不够就少拆几步，不要编
- 如果使用者已经有一些步骤了，别重复它们，只补缺的`

function buildPlanUserPrompt({ projectName, category, description, constraints = [], dueDate, existing = [] }) {
  const lines = ['帮我这个项目拆成能照着做的几步。', '']
  lines.push(`项目名称：${projectName || '（未填）'}`)
  lines.push(`项目类别：${category || '（未填）'}`)
  lines.push(`项目说明：${description || '（未填）'}`)
  if (dueDate) lines.push(`截止日期：${dueDate}`)
  if (constraints.length > 0) {
    lines.push('已知的限制：')
    for (const c of constraints) lines.push(`- ${c}`)
  }

  if (existing.length > 0) {
    lines.push('')
    lines.push('我已经拆出来的步骤（别重复，只补缺的）：')
    for (const [i, t] of existing.entries()) {
      lines.push(`${i + 1}. ${t.title}${t.description ? ` —— ${t.description}` : ''}`)
    }
  }

  return lines.join('\n')
}

export async function planProject(payload, { apiKey, model = DEFAULT_MODEL, baseUrl, compat } = {}) {
  const result = await callForJson({
    apiKey,
    baseUrl,
    compat,
    model,
    system: PLAN_SYSTEM_PROMPT,
    schema: PROJECT_PLAN_SCHEMA,
    userContent: buildPlanUserPrompt(payload),
    maxTokens: 16000,
    // 步数不够、或者哪步没写清，就带着「缺什么」再要一次
    repair: (parsed) => planShortfall(normalizeSteps(parsed)),
  })

  const steps = normalizeSteps(result.parsed)
  if (steps.length === 0) {
    const err = new Error('模型没有给出可用的步骤')
    err.code = 'AI_EMPTY'
    throw err
  }

  return { steps, usage: result.usage, model: result.model, shortfall: result.shortfall || null }
}

// 照这份计划做完，能不能交付？缺什么？
const REVIEW_SYSTEM_PROMPT = `你是一个项目计划复核员。使用者会给你一个项目，
以及他为这个项目拆出来的步骤和要补的知识点。你要判断：
**照这份计划做下去，这个项目能不能做完、能不能交付？缺什么？**

要求：
- 对着项目说明里的交付要求逐条核对，别只看步骤本身
- 缺一整步 → kind 填 missing_step，about 填你建议新增的步骤标题
- 某一步要的知识点没挂上 → kind 填 missing_knowledge，about 填那一步的标题，
  knowledgeName 填建议补的知识点名
- 某一步说不清要做什么、或按它做不完 → kind 填 weak_step，about 填那一步的标题
- detail 要说清楚「缺什么、为什么算缺」，落到这个项目上
- **没看出问题就返回空 gaps**，不要为了凑数硬找。verdict 里说清结论即可`

function buildReviewUserPrompt({ projectName, description, dueDate, tasks = [], knowledge = [] }) {
  const lines = ['帮我看看这份计划做完，能不能交付。', '']
  lines.push(`项目：${projectName || '（未填）'}`)
  lines.push(`说明：${description || '（未填）'}`)
  if (dueDate) lines.push(`截止：${dueDate}`)

  lines.push('')
  lines.push('拆出来的步骤：')
  if (tasks.length === 0) lines.push('（还没拆出步骤）')
  for (const [i, t] of tasks.entries()) {
    lines.push(`${i + 1}. ${t.title}`)
    if (t.description) lines.push(`   要做什么：${t.description}`)
    if (t.doneWhen) lines.push(`   算完成：${t.doneWhen}`)
  }

  lines.push('')
  lines.push('要补的知识点：')
  if (knowledge.length === 0) lines.push('（还没列知识点）')
  for (const k of knowledge) {
    lines.push(`- ${k.name}${k.stepTitle ? ` → 排在「${k.stepTitle}」` : ' → 还没安排到哪一步'}`)
  }

  return lines.join('\n')
}

export async function reviewPlan(payload, { apiKey, model = DEFAULT_MODEL, baseUrl, compat } = {}) {
  const result = await callForJson({
    apiKey,
    baseUrl,
    compat,
    model,
    system: REVIEW_SYSTEM_PROMPT,
    schema: PLAN_REVIEW_SCHEMA,
    userContent: buildReviewUserPrompt(payload),
    maxTokens: 8000,
  })

  return { ...normalizeGaps(result.parsed), usage: result.usage, model: result.model }
}

// 用来验 key 是否可用。走 Models API，不产生推理费用。
export async function verifyClaudeKey({ apiKey, model = DEFAULT_MODEL, baseUrl, compat } = {}) {
  const client = getClient(apiKey, baseUrl)

  // 兼容模式下不能用 Models API：多数第三方端点根本没有这个接口，
  // 会回 401，被误判成「key 无效」—— 明明 key 是好的。
  // 改成发一次最小的对话来验，代价是花掉几个 token。
  if (compat) {
    try {
      await client.messages.create({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      })
      return {
        ok: true,
        model,
        displayName: `${model}（兼容模式，未走 Models API）`,
        maxInputTokens: null,
        baseUrl: baseUrl || DEFAULT_BASE_URL,
      }
    } catch (err) {
      const info = classify(err, baseUrl)
      return { ok: false, code: info.code, message: info.message }
    }
  }

  try {
    // 走 Models API，能验凭据和模型可用性，且不产生推理费用
    const info = await client.models.retrieve(model)
    return {
      ok: true,
      model: info.id,
      displayName: info.display_name,
      maxInputTokens: info.max_input_tokens ?? null,
      baseUrl: baseUrl || DEFAULT_BASE_URL,
    }
  } catch (err) {
    const info = classify(err, baseUrl)
    return { ok: false, code: info.code, message: info.message }
  }
}
