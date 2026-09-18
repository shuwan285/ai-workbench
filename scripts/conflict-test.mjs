// 双标签页冲突的集成测试。
//
// 和 selftest.mjs 的区别：那边测纯函数，这边起一个真的服务实例，
// 并且走**真实的客户端模块**（src/api/index.js 的 pushData）。
// 这一点很关键 —— 用裸 HTTP 测的话，就算前端忘了把基线版本号发出去也照样通过。
//
// 跑法：npm run test:conflict

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 5178
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aiwb-conflict-'))
// 配置目录也必须隔离。不隔离的话这个测试读的是开发者本机真实的
// ~/.ai-workbench/config.json —— 一旦有测试写 AI 配置，就会覆盖掉他自己的 key。
const configDir = mkdtempSync(path.join(os.tmpdir(), 'aiwb-conflict-cfg-'))

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

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    AIWB_API_PORT: String(PORT),
    AIWB_DATA_DIR: dataDir,
    AIWB_CONFIG_DIR: configDir,
  },
  stdio: 'ignore',
})

// 把客户端里的相对路径请求指到测试实例上。
// 顺带说明：Node 的 fetch 不会自动带 Origin，而服务端对「没有 Origin」是同源放行的，
// 所以这里不需要伪造 Origin —— X-AIWB 头由客户端自己带。
const realFetch = globalThis.fetch
globalThis.fetch = (url, opts) => realFetch(`http://127.0.0.1:${PORT}${url}`, opts)

async function waitReady(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await realFetch(`http://127.0.0.1:${PORT}/api/health`)
      if (res.ok) return true
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return false
}

const blank = {
  tasks: [],
  knowledgeConcepts: [],
  projectKnowledge: [],
  agents: [],
  promptTemplates: [],
  resources: [],
  settings: { theme: 'light', categories: ['课程作业'] },
}

const snapshot = (rev, name) => ({ ...blank, revision: rev, projects: [{ id: 'p1', name }] })

const readDisk = () => JSON.parse(readFileSync(path.join(dataDir, 'data.json'), 'utf8'))

try {
  if (!(await waitReady())) {
    console.log('服务没起来，测试中止')
    process.exit(1)
  }

  const { fetchData, pushData } = await import('../src/api/index.js')

  group('建基线')
  const w0 = await pushData(snapshot(1, '初始'), 1, 0)
  check('初始写入第 1 版', w0.ok === true, JSON.stringify(w0))

  group('两个标签页从同一版各改一次')
  // 模拟两个标签页都在第 1 版时打开，各自读到同一个基线
  const bootA = await fetchData()
  const bootB = await fetchData()
  eq('两个标签页读到同一个基线', bootA.revision, bootB.revision)
  eq('基线是第 1 版', bootA.revision, 1)

  // A 先改并写成功
  const wA = await pushData(snapshot(2, 'A 改的'), 2, bootA.revision)
  check('A 基于第 1 版写第 2 版 → 接受', wA.ok === true, JSON.stringify(wA))

  // B 也基于第 1 版改，此时磁盘已经是第 2 版 —— 必须被拦下。
  // 这条同时证明了 pushData 真的把 baseRevision 发出去了。
  const wB = await pushData(snapshot(2, 'B 改的'), 2, bootB.revision)
  eq('B 基于过期基线写入 → 拒绝', wB.code, 'CONFLICT')
  eq('冲突响应带上磁盘版本号', wB.diskRevision, 2)

  group('被拒绝的写入没有污染磁盘')
  const disk = readDisk()
  eq('磁盘内容仍是 A 的', disk.projects[0].name, 'A 改的')
  eq('磁盘版本没被 B 推回去', disk.revision, 2)

  group('关键在于基线，不只是版本号大小')
  // 这一组是为了把「忘了发 baseRevision」和「正确发送」区分开。
  // 如果 pushData 没带基线（服务端会当成 0），下面第二笔就会误判冲突。
  const wC = await pushData(snapshot(3, 'A 又改的'), 3, 2)
  check('连续正常写入：基于第 2 版写第 3 版 → 接受', wC.ok === true, JSON.stringify(wC))
  const wD = await pushData(snapshot(4, 'A 再改的'), 4, 3)
  check('再连一笔：基于第 3 版写第 4 版 → 接受', wD.ok === true, JSON.stringify(wD))
  check(
    '基线确实在发送（否则上面两笔会误报冲突）',
    wC.ok && wD.ok,
    '如果这里失败，说明 pushData 没把 baseRevision 传出去',
  )

  group('B 重新读取后重试')
  const fresh = await fetchData()
  eq('重新读到的是磁盘最新版', fresh.revision, 4)
  const wE = await pushData(snapshot(5, 'B 重试的'), 5, fresh.revision)
  check('B 对齐基线后写入 → 接受', wE.ok === true, JSON.stringify(wE))
  eq('磁盘最终是 B 的内容', readDisk().projects[0].name, 'B 重试的')

  group('force 只在用户明确选择覆盖时使用')
  const wF = await pushData(snapshot(6, '强制覆盖'), 6, 0, true)
  check('带 force 时跳过基线校验', wF.ok === true, JSON.stringify(wF))
  eq('磁盘被覆盖', readDisk().projects[0].name, '强制覆盖')

  // 走真实 HTTP，验的是「接口往外吐什么」——纯函数测不到这一层
  group('AI 配置接口往外吐什么')
  const { getAiConfig, saveAiConfig } = await import('../src/api/index.js')
  const FULL_KEY = 'sk-ant-api03-THIS-IS-A-FAKE-KEY-for-testing-1234'

  const cfgBefore = await getAiConfig()
  check(
    '接口带上预设清单',
    Array.isArray(cfgBefore.providers) && cfgBefore.providers.length > 0,
    JSON.stringify(cfgBefore.providers),
  )
  check('预设里不含任何凭据', !/sk-[A-Za-z0-9_-]{8,}/.test(JSON.stringify(cfgBefore.providers)))
  check('provider 这个死字段已经消失', !('provider' in cfgBefore))
  eq('没配端点时反推成官方', cfgBefore.providerId, 'anthropic')

  const cfgSaved = await saveAiConfig({ apiKey: FULL_KEY })
  check('保存成功', cfgSaved.ok === true, JSON.stringify(cfgSaved))
  check('响应体里没有完整 key', !JSON.stringify(cfgSaved).includes(FULL_KEY))
  check('响应里连 apiKey 这个键名都没有', !JSON.stringify(cfgSaved).includes('"apiKey"'))
  check(
    '只放头尾几位出去',
    Boolean(cfgSaved.keyHint?.startsWith('sk-ant-') && cfgSaved.keyHint?.endsWith('1234')),
    cfgSaved.keyHint,
  )

  // 这条同时证明配置目录的隔离是有效的：key 落在临时目录，没碰开发者本机那份
  const onDisk = JSON.parse(readFileSync(path.join(configDir, 'config.json'), 'utf8'))
  eq('key 只落在隔离出来的配置目录里', onDisk.ai.apiKey, FULL_KEY)
} finally {
  server.kill()
  await new Promise((r) => setTimeout(r, 200))
  globalThis.fetch = realFetch
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(configDir, { recursive: true, force: true })
}

console.log(lines.join('\n'))
console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail > 0 ? 1 : 0)
