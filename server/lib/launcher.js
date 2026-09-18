import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { isAllowed } from './commandWhitelist.js'
import { isNonEmptyString } from './validate.js'
import { resolveCommand } from './whichCommand.js'

// 唯一的子进程出口。三条底线：
//   1. shell 永远为 false，不用 exec / execSync，参数以数组交给 spawn
//   2. 桌面类型直接把参数交给系统；命令行类型为了开出真终端必须过 cmd.exe 的 start，
//      而 cmd 会二次解析命令行，所以带 shell 元字符的参数直接拒绝，不做转义
//   3. 命令类型必须先过允许列表

// cmd.exe 会二次解析命令行，这几个字符会改变参数的含义：
//   & 拆命令、| 管道、^ 转义、< > 重定向、% 展开变量、引号会破坏配对。
// 与其写容易漏的转义，不如拒绝 —— 和拒绝 .bat/.cmd 是同一个理由。
const SHELL_META = /[&|^<>%"\r\n]/

function fail(err) {
  const code =
    err.code === 'ENOENT'
      ? 'NOT_FOUND'
      : err.code === 'EACCES'
        ? 'PERMISSION_DENIED'
        : 'LAUNCH_FAILED'
  return { ok: false, code, message: err.message }
}

function spawnDetached(file, args) {
  return new Promise((resolve) => {
    let settled = false
    const done = (r) => {
      if (settled) return
      settled = true
      resolve(r)
    }

    let child
    try {
      child = spawn(file, args, { detached: true, stdio: 'ignore', shell: false })
    } catch (err) {
      return done(fail(err))
    }

    child.once('error', (err) => done(fail(err)))
    child.once('spawn', () => {
      // 脱离父进程，关掉工作台时不会连带杀掉启动的程序
      child.unref()
      done({ ok: true })
    })
  })
}

// 导出是为了让测试能在不起进程的前提下验判定顺序（见 scripts/launch-test.mjs）
export function buildSpawnSpec(agent) {
  if (agent.type === 'desktop') {
    const target = agent.localPath
    if (!isNonEmptyString(target)) return { error: 'EMPTY_PATH' }
    if (!fs.existsSync(target)) return { error: 'NOT_FOUND', detail: target }

    let stat
    try {
      stat = fs.statSync(target)
    } catch (err) {
      return { error: 'LAUNCH_FAILED', detail: target, message: err.message }
    }
    if (stat.isDirectory()) return { error: 'IS_DIRECTORY', detail: target }

    if (process.platform === 'win32') {
      const ext = path.extname(target).toLowerCase()
      // bat/cmd 得经 cmd.exe，而 cmd.exe 会再解析一次命令行，路径里的 & | 会变成语法。
      // 与其写容易漏的转义，不如让用户改用「命令行」类型。
      if (ext === '.bat' || ext === '.cmd') {
        return { error: 'BATCH_NOT_SUPPORTED', detail: target }
      }
      // .lnk 不能直接 spawn，交给资源管理器
      if (ext === '.lnk') {
        return { file: 'explorer.exe', args: [target], display: target }
      }
      return { file: target, args: [], display: target }
    }

    if (process.platform === 'darwin') {
      return { file: 'open', args: [target], display: target }
    }

    try {
      fs.accessSync(target, fs.constants.X_OK)
    } catch {
      return { error: 'PERMISSION_DENIED', detail: target }
    }
    return { file: target, args: [], display: target }
  }

  if (agent.type === 'command') {
    if (!isNonEmptyString(agent.command)) return { error: 'EMPTY_COMMAND' }
    if (!isAllowed(agent.command)) {
      return { error: 'COMMAND_NOT_ALLOWED', detail: agent.command }
    }

    const args = agent.args || []
    const display = [agent.command, ...args].join(' ')

    if (process.platform !== 'win32') {
      // 非 Windows 维持直接 spawn：路径不对会走 ENOENT，不需要提前查。
      // 代价是拿不到可见终端，交互式程序起不来 —— 见 README 的已知限制。
      return { file: agent.command, args, display }
    }

    // 命令行程序要的是能敲进去的终端。detached + stdio:ignore 起的进程既没有控制台
    // 也没有输入，交互式程序会直接退出，所以必须经 start 开一个真窗口。
    // 而 start 找不到命令时不会有 ENOENT（cmd.exe 自己总能起来），所以得先自己查。
    const resolved = resolveCommand(agent.command)
    if (!resolved) {
      return { error: 'COMMAND_NOT_FOUND', detail: agent.command, display }
    }

    // 解析出的绝对路径同样会进 cmd 的命令行，所以也得过同一遍检查 ——
    // 直接 spawn 时路径里带 & 是安全的，经了 cmd 就不是了
    if (SHELL_META.test(resolved)) {
      return { error: 'PATH_UNSAFE', detail: resolved, display }
    }

    const unsafe = args.find((a) => SHELL_META.test(a))
    if (unsafe) return { error: 'ARG_UNSAFE', detail: unsafe, display }

    // start 的第一个带引号的参数会被当成窗口标题，所以先垫一个空串。
    return {
      file: 'cmd.exe',
      args: ['/c', 'start', '', resolved, ...args],
      display,
    }
  }

  return { error: 'UNKNOWN_TYPE', detail: String(agent.type) }
}

// 打开一个目录。只由服务端自己调用，路径是服务端定的，不接受前端传参，
// 所以没有路径注入面。与 launchAgent 共用同一个 spawn 出口。
export async function openDirectory(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      return { ok: false, code: 'LAUNCH_FAILED', message: err.message }
    }
  }

  const spec =
    process.platform === 'win32'
      ? { file: 'explorer.exe', args: [dir] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [dir] }
        : { file: 'xdg-open', args: [dir] }

  return spawnDetached(spec.file, spec.args)
}

export async function launchAgent(agent) {
  const spec = buildSpawnSpec(agent)

  if (spec.error) {
    return {
      ok: false,
      code: spec.error,
      target: spec.detail,
      message: spec.message,
      commandLine: spec.display,
    }
  }

  const result = await spawnDetached(spec.file, spec.args)
  return { ...result, commandLine: spec.display }
}
