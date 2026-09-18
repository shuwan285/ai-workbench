import express from 'express'
import cors from 'cors'
import { ALLOWED_ORIGINS, guard } from './lib/security.js'
import { getConfigDir } from './lib/config.js'
import { getDataFile } from './lib/dataStore.js'
import dataRoutes from './routes/data.js'
import launchRoutes from './routes/launch.js'
import pickPathRoutes from './routes/pickPath.js'
import suggestRoutes from './routes/suggest.js'
import configRoutes from './routes/config.js'

const PORT = Number(process.env.AIWB_API_PORT || 5174)
// 只绑回环地址，局域网里的其他设备访问不到
const HOST = '127.0.0.1'

const app = express()

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-AIWB'],
  }),
)

// guard 只读请求头，放在 body 解析之前，超大的请求连解析都不用做
app.use(guard)

// 数据文件的体积上限比别的接口大得多，单独挂一个解析器
app.use('/api/data', express.json({ limit: '16mb' }), dataRoutes)
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (req, res) => res.json({ ok: true, host: HOST, port: PORT }))
app.use('/api/agent', launchRoutes)
app.use('/api/agent', pickPathRoutes)
app.use('/api/ai', suggestRoutes)
app.use('/api/config', configRoutes)

app.use((req, res) => {
  res.status(404).json({ ok: false, code: 'NO_ROUTE', message: `没有这个接口：${req.path}` })
})

app.use((err, req, res, next) => {
  // body 超限之类的解析错误
  const tooLarge = err.type === 'entity.too.large'
  console.error('[server]', err.message)
  res.status(tooLarge ? 413 : 500).json({
    ok: false,
    code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'SERVER_ERROR',
    message: tooLarge ? '请求体太大了' : err.message,
  })
})

app.listen(PORT, HOST, () => {
  console.log(`  AI 创作项目工作台 · 本地服务`)
  console.log(`  接口   http://${HOST}:${PORT}/api`)
  console.log(`  数据   ${getDataFile()}`)
  console.log(`  配置   ${getConfigDir()}`)
})
