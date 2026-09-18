import fs from 'node:fs'
import path from 'node:path'

// 在 PATH 里按 PATHEXT 找一个可执行文件，返回绝对路径，找不到返回 null。
//
// 为什么需要它：命令行类型走 cmd /c start 启动，而命令找不到时不会有 ENOENT ——
// cmd.exe 自己总能起来，目标程序找不到只会在新终端里报一句然后关掉。
// 所以「命令没装」必须在启动前自己查出来，否则又变成静默失败。
//
// 只在 Windows 上用。非 Windows 是直接 spawn，路径不对会走 ENOENT，不需要提前查。
export function resolveCommand(command) {
  if (!command) return null

  // 填的是完整路径就只验存在性，不去 PATH 里找
  if (path.isAbsolute(command) || /[\\/]/.test(command)) {
    try {
      return fs.statSync(command).isFile() ? command : null
    } catch {
      return null
    }
  }

  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)

  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, command + ext)
      try {
        if (fs.statSync(full).isFile()) return full
      } catch {
        // 这一格没有，继续找
      }
    }
  }

  return null
}
