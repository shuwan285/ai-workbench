import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 数据目录跟着用户主目录走，代码里不出现任何盘符。
// 想放到别处就设 AIWB_DATA_DIR。
const DATA_DIR =
  process.env.AIWB_DATA_DIR ||
  process.env.AIWB_CONFIG_DIR ||
  path.join(os.homedir(), '.ai-workbench')

const DATA_FILE = path.join(DATA_DIR, 'data.json')
const BACKUP_FILE = path.join(DATA_DIR, 'data.backup.json')
const TMP_FILE = path.join(DATA_DIR, 'data.tmp.json')
const CORRUPT_FILE = path.join(DATA_DIR, 'data.corrupt.json')

export function getDataDir() {
  return DATA_DIR
}

export function getDataFile() {
  return DATA_FILE
}

export function readData() {
  let raw
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { exists: false, state: null, revision: 0, savedAt: null, bytes: 0 }
    }
    return {
      exists: false,
      state: null,
      revision: 0,
      savedAt: null,
      bytes: 0,
      error: err.message,
    }
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('顶层不是对象')
    }
    const { savedAt, ...state } = parsed
    return {
      exists: true,
      state,
      revision: Number(state.revision) || 0,
      savedAt: savedAt || null,
      bytes: Buffer.byteLength(raw),
    }
  } catch (err) {
    // 文件读坏了。先把原始内容挪到一边，绝不直接覆盖 —— 那可能是唯一的副本。
    let preserved = null
    try {
      fs.copyFileSync(DATA_FILE, CORRUPT_FILE)
      preserved = CORRUPT_FILE
    } catch {
      /* 存不下来也只能继续 */
    }
    return {
      exists: false,
      state: null,
      revision: 0,
      savedAt: null,
      bytes: Buffer.byteLength(raw),
      corrupt: err.message,
      preservedAt: preserved,
    }
  }
}

export function writeData(state, revision) {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const savedAt = new Date().toISOString()
  const payload = { ...state, revision: Number(revision) || 0, savedAt }
  const json = JSON.stringify(payload, null, 2)

  // 先写临时文件再改名。写到一半断电也不会把原来的文件毁掉。
  // Node 在 Windows 上用的是 MoveFileEx + REPLACE_EXISTING，覆盖已有文件是原子的。
  fs.writeFileSync(TMP_FILE, json, 'utf8')

  if (fs.existsSync(DATA_FILE)) {
    try {
      fs.copyFileSync(DATA_FILE, BACKUP_FILE)
    } catch {
      /* 备份失败不该挡住保存 */
    }
  }

  fs.renameSync(TMP_FILE, DATA_FILE)

  return {
    revision: payload.revision,
    savedAt,
    bytes: Buffer.byteLength(json),
  }
}
