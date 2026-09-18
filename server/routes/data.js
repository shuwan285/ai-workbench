import { Router } from 'express'
import { openDirectory } from '../lib/launcher.js'
import { getDataDir, getDataFile, readData, writeData } from '../lib/dataStore.js'

// 挂在 /api/data 下，所以这里的路径都是相对的
const router = Router()

router.get('/', (req, res) => {
  res.json({ ok: true, dataDir: getDataDir(), dataFile: getDataFile(), ...readData() })
})

router.put('/', (req, res) => {
  const { state, revision, baseRevision, force } = req.body ?? {}

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return res
      .status(400)
      .json({ ok: false, code: 'BAD_STATE', message: 'state 必须是一个对象' })
  }

  const incoming = Number(revision) || 0
  // 客户端这次改动是基于哪一版做的。恢复场景下用户明确选择覆盖时可以为空。
  const base = Number(baseRevision) || 0
  const forced = force === true
  const current = readData()

  // 乐观并发控制比对的是「基线」，不是新版本号。
  //
  // 只比新版本号挡不住这种情况：两个标签页都停在第 5 版，各自改一次，
  // 算出来的新版本号都是 6，6 < 6 不成立，后写的就把先写的静默覆盖了。
  // 比对基线才能发现「你基于第 5 版改，但磁盘已经到第 6 版了」。
  if (current.exists && !forced && base !== current.revision) {
    return res.status(409).json({
      ok: false,
      code: 'CONFLICT',
      message: `这次改动基于第 ${base} 版，磁盘上已经是第 ${current.revision} 版`,
      diskRevision: current.revision,
      diskSavedAt: current.savedAt,
    })
  }

  // 兜底：新版本号比磁盘还旧
  if (current.exists && !forced && incoming < current.revision) {
    return res.status(409).json({
      ok: false,
      code: 'CONFLICT',
      message: `磁盘上是第 ${current.revision} 版，比这次要写的第 ${incoming} 版新`,
      diskRevision: current.revision,
      diskSavedAt: current.savedAt,
    })
  }

  try {
    const result = writeData(state, incoming)
    return res.json({ ok: true, ...result })
  } catch (err) {
    return res.status(500).json({ ok: false, code: 'WRITE_FAILED', message: err.message })
  }
})

// 打开数据目录。路径由服务端自己决定，不接受任何入参。
//
// 这个接口的副作用是可见的（弹一个资源管理器窗口），不该成为一个常驻且无限制的本地能力，
// 所以加了两道约束：
//   1. 生产环境默认关闭。要开就显式设 AIWB_ALLOW_REVEAL=1。
//      关闭时返回 404 而不是 403 —— 不对外暴露这个接口存在。
//   2. 冷却时间，避免被反复调用刷屏。
// 每次真正执行都会打一条日志，便于事后查是谁在什么时候打开的。
const REVEAL_ENABLED =
  process.env.AIWB_ALLOW_REVEAL === '1' || process.env.NODE_ENV !== 'production'
const REVEAL_COOLDOWN_MS = 3000
let lastRevealAt = 0

router.post('/reveal', async (req, res) => {
  if (!REVEAL_ENABLED) {
    return res
      .status(404)
      .json({ ok: false, code: 'NO_ROUTE', message: '没有这个接口' })
  }

  const now = Date.now()
  if (now - lastRevealAt < REVEAL_COOLDOWN_MS) {
    return res.status(429).json({
      ok: false,
      code: 'TOO_FREQUENT',
      message: '操作太频繁了，稍等一下再试',
    })
  }
  lastRevealAt = now

  const dir = getDataDir()
  console.log(`[reveal] ${new Date().toISOString()} 打开数据目录 ${dir}`)
  const result = await openDirectory(dir)
  res.json(result)
})

export default router
