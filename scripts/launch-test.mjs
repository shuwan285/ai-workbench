// 命令行启动规则的测试。跑法：npm run test:launch
//
// 故意不起真进程：这里验的是「判定顺序和错误码」，真启动会开终端窗口，
// 那部分只能人眼看，归 docs/手工验收清单.md 场景 9。

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// config.js 在模块加载时就把 AIWB_CONFIG_DIR 读进常量了，
// 所以必须在 import 之前设好，否则会去动用户真的 ~/.ai-workbench/config.json。
const cfgDir = mkdtempSync(path.join(os.tmpdir(), 'aiwb-launch-'))
process.env.AIWB_CONFIG_DIR = cfgDir

const { buildSpawnSpec } = await import('../server/lib/launcher.js')
const { resolveCommand } = await import('../server/lib/whichCommand.js')
const { addCustomCommand } = await import('../server/lib/commandWhitelist.js')

let pass = 0
let fail = 0
const lines = []
const isWin = process.platform === 'win32'

function group(title) {
  lines.push(`\n${title}`)
}

function note(text) {
  lines.push(`  · ${text}`)
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
  check(
    name,
    actual === expected,
    `实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`,
  )
}

/* ---------- 1. 桌面类型：这轮没动，确认没碰坏 ---------- */
group('桌面类型（回归）')
eq('空路径', buildSpawnSpec({ type: 'desktop', localPath: '' }).error, 'EMPTY_PATH')
eq(
  '路径不存在',
  buildSpawnSpec({ type: 'desktop', localPath: path.join(cfgDir, 'nope.exe') }).error,
  'NOT_FOUND',
)
eq('指向文件夹', buildSpawnSpec({ type: 'desktop', localPath: cfgDir }).error, 'IS_DIRECTORY')
eq('未知类型', buildSpawnSpec({ type: 'wtf' }).error, 'UNKNOWN_TYPE')

/* ---------- 2. 允许列表：所有平台都成立 ---------- */
group('命令行类型 · 允许列表')
eq('空命令', buildSpawnSpec({ type: 'command', command: '' }).error, 'EMPTY_COMMAND')
eq(
  '不在允许列表里',
  buildSpawnSpec({ type: 'command', command: 'curl' }).error,
  'COMMAND_NOT_ALLOWED',
)

if (!isWin) {
  lines.push('\n（下面几组验的是 Windows 的启动路径，当前平台跳过）')
} else {
  /* ---------- 3. PATH 解析 ---------- */
  group('PATH 解析')
  const nodePath = resolveCommand('node')
  check('node 能解析出绝对路径', Boolean(nodePath) && path.isAbsolute(nodePath), String(nodePath))
  check('解析出来的文件确实存在', Boolean(nodePath) && existsSync(nodePath))
  eq('给绝对路径就原样返回', resolveCommand(process.execPath), process.execPath)
  eq('绝对路径不存在返回 null', resolveCommand(path.join(cfgDir, 'nope.exe')), null)
  eq('名字不存在返回 null', resolveCommand('definitely-not-a-real-command-xyz'), null)

  /* ---------- 4. 命令没装 ---------- */
  group('命令行类型 · 命令没装')
  // 先塞进允许列表，这样才会走到「查 PATH」这一步；
  // 名字带前缀是为了保证它不可能真的装在机器上。
  addCustomCommand('aiwb-launch-probe-xyz')
  eq(
    '在允许列表里但系统没装',
    buildSpawnSpec({ type: 'command', command: 'aiwb-launch-probe-xyz' }).error,
    'COMMAND_NOT_FOUND',
  )

  /* ---------- 5. 参数守卫 ---------- */
  group('命令行类型 · 参数守卫')
  // 这些字符交给 cmd.exe 会改变含义：& 拆命令、| 管道、% 展开变量、引号破坏配对
  for (const bad of ['a&b', 'a|b', 'a^b', 'a<b', 'a>b', '100%', 'say "hi"', 'two\nlines']) {
    const spec = buildSpawnSpec({ type: 'command', command: 'node', args: [bad] })
    eq(`拒绝 ${JSON.stringify(bad)}`, spec.error, 'ARG_UNSAFE')
  }

  const okSpec = buildSpawnSpec({ type: 'command', command: 'node', args: ['-e', '1'] })
  eq('正常参数放行', okSpec.error, undefined)
  eq('走 cmd.exe', okSpec.file, 'cmd.exe')
  eq('前三个是 /c start 和空标题', JSON.stringify(okSpec.args.slice(0, 3)), JSON.stringify(['/c', 'start', '']))
  eq('命令换成解析出的绝对路径', okSpec.args[3], nodePath)
  eq('原参数原样接在后面', JSON.stringify(okSpec.args.slice(4)), JSON.stringify(['-e', '1']))
  eq('界面上仍显示用户填的命令', okSpec.display, 'node -e 1')

  const spaced = buildSpawnSpec({
    type: 'command',
    command: 'node',
    args: [path.join(cfgDir, 'my script.py')],
  })
  check('带空格的参数不算危险', !spaced.error, spaced.error)

  /* ---------- 6. 命令所在路径本身带危险字符 ---------- */
  group('命令行类型 · 路径守卫')
  // 造一个目录名带 & 的场景：& 在直接 spawn 下没事，进了 cmd 命令行就成了分隔符
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const weirdDir = path.join(cfgDir, 'a&b')
  mkdirSync(weirdDir, { recursive: true })
  writeFileSync(path.join(weirdDir, 'aiwb-launch-probe-xyz.exe'), '', 'utf8')

  addCustomCommand('aiwb-launch-probe-xyz2')
  writeFileSync(path.join(weirdDir, 'aiwb-launch-probe-xyz2.exe'), '', 'utf8')

  const savedPath = process.env.PATH
  process.env.PATH = weirdDir
  eq(
    'PATH 里的目录名带 & → 拒绝',
    buildSpawnSpec({ type: 'command', command: 'aiwb-launch-probe-xyz2' }).error,
    'PATH_UNSAFE',
  )
  process.env.PATH = savedPath

  /* ---------- 7. 判定顺序 ---------- */
  group('判定顺序')
  eq(
    '命令没装优先于参数危险',
    buildSpawnSpec({ type: 'command', command: 'aiwb-launch-probe-xyz', args: ['a&b'] }).error,
    'COMMAND_NOT_FOUND',
  )
  eq(
    '不在允许列表优先于命令没装',
    buildSpawnSpec({ type: 'command', command: 'curl', args: ['a&b'] }).error,
    'COMMAND_NOT_ALLOWED',
  )
}

rmSync(cfgDir, { recursive: true, force: true })
delete process.env.AIWB_CONFIG_DIR

/* ---------- 汇总 ---------- */
console.log(lines.join('\n'))
console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail > 0 ? 1 : 0)
