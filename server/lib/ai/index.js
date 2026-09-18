import { readAiConfig } from '../config.js'
import {
  assignKnowledgeSteps as mockAssignSteps,
  planProject as mockPlanProject,
  reviewPlan as mockReviewPlan,
  suggestKnowledge as mockSuggestKnowledge,
} from '../mock-ai.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  assignKnowledgeSteps as assignWithClaude,
  planProject as planWithClaude,
  reviewPlan as reviewWithClaude,
  suggestWithClaude,
  verifyClaudeKey,
} from './anthropic.js'
import { PROVIDERS, matchProvider } from './providers.js'

export { verifyClaudeKey, DEFAULT_MODEL, DEFAULT_BASE_URL, PROVIDERS }

// 只暴露 key 的头尾，用来让用户确认「填的是哪一把」，中间一律不返回。
function maskKey(key) {
  if (!key) return null
  if (key.length <= 12) return '（已配置）'
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}

// 凭据可以从环境变量来（方便），但请求发去哪不行（见 anthropic.js 的说明）。
function resolveKey() {
  const cfg = readAiConfig()
  return cfg.apiKey || process.env.ANTHROPIC_API_KEY || ''
}

export function getAiStatus() {
  const cfg = readAiConfig()
  const fromEnv = !cfg.apiKey && Boolean(process.env.ANTHROPIC_API_KEY)
  const key = resolveKey()

  return {
    model: cfg.model || DEFAULT_MODEL,
    baseUrl: cfg.baseUrl || '',
    defaultBaseUrl: DEFAULT_BASE_URL,
    // 供应商是设置页的填充器，不是存下来的状态 —— 从端点地址反推，供界面回显下拉框
    providerId: matchProvider(cfg.baseUrl).id,
    compatMode: Boolean(cfg.compatMode),
    configured: Boolean(key),
    // 让用户知道这把 key 是从哪来的，否则改了环境变量没生效会很懵
    source: cfg.apiKey ? 'config' : fromEnv ? 'env' : null,
    keyHint: maskKey(key),
  }
}

export async function suggestKnowledge(payload) {
  const status = getAiStatus()

  if (!status.configured) {
    return {
      ok: true,
      source: 'mock',
      items: mockSuggestKnowledge(payload),
      notice: '当前用的是本地模拟数据。到设置页填一个 API key，就会换成真实模型生成。',
    }
  }

  try {
    const result = await suggestWithClaude(payload, {
      apiKey: resolveKey(),
      model: status.model,
      baseUrl: status.baseUrl,
      compat: status.compatMode,
    })
    return {
      ok: true,
      source: 'claude',
      model: result.model,
      usage: result.usage,
      items: result.items,
      // 让它重来过一次还是不够 —— 如实说，别让人以为这就齐了
      notice: result.shortfall
        ? `这次生成得偏少：${result.shortfall}。可以再点一次，或者手动补几条。`
        : undefined,
    }
  } catch (err) {
    // 真实调用失败不阻断流程 —— 退回模拟数据，但如实说清楚这次是假的，
    // 否则用户会以为模型真的生成了这些内容。
    return {
      ok: true,
      source: 'mock',
      items: mockSuggestKnowledge(payload),
      notice: `调用 Claude 失败：${err.message}。这次显示的是本地模拟数据。`,
      error: { code: err.code || 'AI_ERROR', message: err.message },
    }
  }
}

// 照这份计划做完能不能交付。失败同样回退模拟数据 ——
// 但模拟数据只能查「有没有写全」，查不出「缺哪一步」，notice 里说清楚。
export async function reviewSteps(payload) {
  const status = getAiStatus()

  if (!status.configured) {
    return {
      ok: true,
      source: 'mock',
      ...mockReviewPlan(payload),
      notice: '当前用的是本地模拟数据，只能做结构检查。到设置页填一个 API key，才能真的帮着审完整性。',
    }
  }

  try {
    const result = await reviewWithClaude(payload, {
      apiKey: resolveKey(),
      model: status.model,
      baseUrl: status.baseUrl,
      compat: status.compatMode,
    })
    return {
      ok: true,
      source: 'claude',
      model: result.model,
      usage: result.usage,
      verdict: result.verdict,
      gaps: result.gaps,
    }
  } catch (err) {
    return {
      ok: true,
      source: 'mock',
      ...mockReviewPlan(payload),
      notice: `调用 Claude 失败：${err.message}。这次用的是本地模拟数据（只能做结构检查）。`,
      error: { code: err.code || 'AI_ERROR', message: err.message },
    }
  }
}

// 把项目拆成能照着做的几步。失败同样回退模拟数据并说清楚。
export async function planSteps(payload) {
  const status = getAiStatus()

  if (!status.configured) {
    return {
      ok: true,
      source: 'mock',
      steps: mockPlanProject(payload),
      notice: '当前用的是本地模拟数据（按项目类别给的通用拆法）。到设置页填一个 API key，就会换成真实模型。',
    }
  }

  try {
    const result = await planWithClaude(payload, {
      apiKey: resolveKey(),
      model: status.model,
      baseUrl: status.baseUrl,
      compat: status.compatMode,
    })
    return {
      ok: true,
      source: 'claude',
      model: result.model,
      usage: result.usage,
      steps: result.steps,
      notice: result.shortfall
        ? `这次拆得偏少：${result.shortfall}。可以再点一次，或者手动补几步。`
        : undefined,
    }
  } catch (err) {
    return {
      ok: true,
      source: 'mock',
      steps: mockPlanProject(payload),
      notice: `调用 Claude 失败：${err.message}。这次用的是本地模拟数据。`,
      error: { code: err.code || 'AI_ERROR', message: err.message },
    }
  }
}

// 把已有的知识点排到各步。和上面那条一样：失败要可见，别让人以为是真的排的。
export async function assignSteps(payload) {
  const status = getAiStatus()

  if (!status.configured) {
    return {
      ok: true,
      source: 'mock',
      assignments: mockAssignSteps(payload),
      notice: '当前用的是本地模拟数据（按关键词匹配）。到设置页填一个 API key，就会换成真实模型。',
    }
  }

  try {
    const result = await assignWithClaude(payload, {
      apiKey: resolveKey(),
      model: status.model,
      baseUrl: status.baseUrl,
      compat: status.compatMode,
    })
    return {
      ok: true,
      source: 'claude',
      model: result.model,
      usage: result.usage,
      assignments: result.assignments,
    }
  } catch (err) {
    return {
      ok: true,
      source: 'mock',
      assignments: mockAssignSteps(payload),
      notice: `调用 Claude 失败：${err.message}。这次用的是本地模拟数据。`,
      error: { code: err.code || 'AI_ERROR', message: err.message },
    }
  }
}
