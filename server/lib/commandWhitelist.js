import { readConfig, writeConfig } from './config.js'

// 默认允许列表。这不是硬限制，用户在设置页可以加自定义命令。
export const DEFAULT_COMMANDS = [
  'python',
  'python3',
  'node',
  'npm',
  'npx',
  'git',
  'code',
  'ollama',
  'jupyter',
  'conda',
  'pip',
  'claude',
  'cargo',
  'java',
  'R',
  'Rscript',
]

// 归一化：去掉目录部分和可执行后缀，只留命令名。
// 这样 C:\Python312\python.exe 和 python 视为同一个。
export function normalizeCommand(cmd) {
  if (typeof cmd !== 'string') return ''
  const base = cmd.trim().split(/[\\/]/).pop() || ''
  return base.replace(/\.(exe|cmd|bat|sh|ps1)$/i, '')
}

export function listCommands() {
  const { customCommands } = readConfig()
  const custom = customCommands.filter((c) => c && c.command)
  const allowed = new Set(
    [...DEFAULT_COMMANDS, ...custom.map((c) => c.command)].map(normalizeCommand),
  )
  return {
    defaults: DEFAULT_COMMANDS,
    custom,
    allowed: [...allowed],
  }
}

export function isAllowed(command) {
  const name = normalizeCommand(command)
  if (!name) return false
  return listCommands().allowed.includes(name)
}

export function addCustomCommand(command, note = '') {
  const name = normalizeCommand(command)
  if (!name) throw new Error('命令不能为空')
  if (DEFAULT_COMMANDS.map(normalizeCommand).includes(name)) {
    throw new Error(`「${name}」已在默认允许列表中`)
  }
  const { customCommands } = readConfig()
  if (customCommands.some((c) => normalizeCommand(c.command) === name)) {
    throw new Error(`「${name}」已经添加过了`)
  }
  const next = [
    ...customCommands,
    { command: name, note: String(note).slice(0, 200), addedAt: new Date().toISOString() },
  ]
  writeConfig({ customCommands: next })
  return listCommands()
}

export function removeCustomCommand(command) {
  const name = normalizeCommand(command)
  const { customCommands } = readConfig()
  const next = customCommands.filter((c) => normalizeCommand(c.command) !== name)
  if (next.length === customCommands.length) {
    throw new Error(`自定义列表里没有「${name}」`)
  }
  writeConfig({ customCommands: next })
  return listCommands()
}
