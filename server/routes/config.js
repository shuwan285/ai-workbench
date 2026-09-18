import { Router } from 'express'
import { DEFAULT_MODEL, PROVIDERS, getAiStatus, verifyClaudeKey } from '../lib/ai/index.js'
import {
  addCustomCommand,
  listCommands,
  removeCustomCommand,
} from '../lib/commandWhitelist.js'
import { getConfigDir, readAiConfig, updateAiConfig } from '../lib/config.js'

const router = Router()

router.get('/commands', (req, res) => {
  res.json({ ok: true, configDir: getConfigDir(), ...listCommands() })
})

router.post('/commands', (req, res) => {
  try {
    const result = addCustomCommand(req.body?.command, req.body?.note)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ ok: false, code: 'INVALID_COMMAND', message: err.message })
  }
})

router.delete('/commands/:command', (req, res) => {
  try {
    const result = removeCustomCommand(decodeURIComponent(req.params.command))
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ ok: false, code: 'NOT_FOUND', message: err.message })
  }
})

/* ---------- 真实模型接入 ---------- */
//
// apiKey 的读写规则：写进来可以，读出去永远不行。
// GET 只返回「配没配」「哪来的」「头尾几个字符」，中间部分不出这个进程。

// 预设表跟着状态一起下发，前端不用自己写一份，也不该自己写一份
router.get('/ai', (req, res) => {
  res.json({
    ok: true,
    defaultModel: DEFAULT_MODEL,
    providers: PROVIDERS,
    ...getAiStatus(),
  })
})

router.put('/ai', (req, res) => {
  const { apiKey, model, baseUrl, compatMode } = req.body ?? {}
  const patch = {}

  if (typeof apiKey === 'string') patch.apiKey = apiKey.trim()
  if (typeof model === 'string' && model.trim()) patch.model = model.trim()
  if (typeof compatMode === 'boolean') patch.compatMode = compatMode
  if (typeof baseUrl === 'string') {
    const url = baseUrl.trim()
    // 空字符串表示回到官方端点；填了就得是 http(s)
    if (url && !/^https?:\/\//i.test(url)) {
      return res.status(400).json({
        ok: false,
        code: 'BAD_BASE_URL',
        message: '端点地址要以 http:// 或 https:// 开头',
      })
    }
    patch.baseUrl = url
  }

  if (Object.keys(patch).length === 0) {
    return res
      .status(400)
      .json({ ok: false, code: 'BAD_REQUEST', message: '没有要更新的字段' })
  }

  try {
    updateAiConfig(patch)
    res.json({
      ok: true,
      defaultModel: DEFAULT_MODEL,
      providers: PROVIDERS,
      ...getAiStatus(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, code: 'WRITE_FAILED', message: err.message })
  }
})

// body 里带 apiKey 就测那一把（用于「先测再存」），否则测已保存或环境变量里的
router.post('/ai/test', async (req, res) => {
  const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''
  const cfg = readAiConfig()
  const key = bodyKey || cfg.apiKey || process.env.ANTHROPIC_API_KEY || ''
  const model = (typeof req.body?.model === 'string' && req.body.model.trim()) || cfg.model
  const baseUrl =
    typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : cfg.baseUrl
  const compat =
    typeof req.body?.compatMode === 'boolean' ? req.body.compatMode : Boolean(cfg.compatMode)

  if (!key) {
    return res.json({ ok: false, code: 'AI_NO_KEY', message: '还没有填 API key' })
  }

  const result = await verifyClaudeKey({ apiKey: key, model, baseUrl, compat })
  res.json(result)
})

export default router
