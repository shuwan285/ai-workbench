import { Router } from 'express'
import { launchAgent } from '../lib/launcher.js'
import { sanitizeArgs, isNonEmptyString } from '../lib/validate.js'

const router = Router()

router.post('/launch', async (req, res) => {
  let args
  try {
    args = sanitizeArgs(req.body?.args)
  } catch (err) {
    return res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: err.message })
  }

  const type = req.body?.type
  const agent = {
    type,
    localPath: isNonEmptyString(req.body?.localPath, 4096) ? req.body.localPath : '',
    command: isNonEmptyString(req.body?.command, 256) ? req.body.command : '',
    args,
  }

  const result = await launchAgent(agent)

  // 启动失败属于正常业务结果，用 200 返回，前端统一看 ok 字段
  return res.json(result)
})

export default router
