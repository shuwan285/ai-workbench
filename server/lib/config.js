import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_MODEL } from './ai/providers.js'

// 配置目录固定在用户主目录下，不依赖项目所在盘符。
// 需要换位置时设环境变量 AIWB_CONFIG_DIR。
const CONFIG_DIR =
  process.env.AIWB_CONFIG_DIR || path.join(os.homedir(), '.ai-workbench')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULTS = {
  version: 1,
  // 用户显式添加的可信命令：[{ command, note, addedAt }]
  customCommands: [],
  // 真实模型接入。apiKey 只存在这里，永远不返回给前端。
  // 这里没有 provider 字段：供应商只是设置页的填充器，存下来的端点地址才是事实。
  ai: {
    apiKey: '',
    model: DEFAULT_MODEL,
    // 留空表示用官方端点。故意不读环境变量里的 ANTHROPIC_BASE_URL ——
    // 那是给别的工具设的，不该悄悄改掉这个应用把请求发去哪。
    baseUrl: '',
    // 端点不支持 Anthropic 的结构化输出（多数第三方兼容端点都是）时打开。
    // 打开后不改用 output_config，而是把要的形状写进提示词、自己去返回里挖 JSON。
    compatMode: false,
  },
}

export function getConfigDir() {
  return CONFIG_DIR
}

export function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return { ...DEFAULTS, ...parsed }
  } catch {
    // 文件不存在或内容损坏都退回默认值，不阻塞服务启动
    return { ...DEFAULTS }
  }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

// ai 是嵌套对象，writeConfig 的浅合并会整个替换掉它，所以单独处理
export function updateAiConfig(patch) {
  const current = readConfig().ai || {}
  return writeConfig({ ai: { ...DEFAULTS.ai, ...current, ...patch } })
}

export function readAiConfig() {
  return { ...DEFAULTS.ai, ...(readConfig().ai || {}) }
}
