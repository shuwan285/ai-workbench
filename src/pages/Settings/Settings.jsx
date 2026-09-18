import { useEffect, useRef, useState } from 'react'
import {
  addCustomCommand,
  getAiConfig,
  listCommands,
  removeCustomCommand,
  saveAiConfig,
  testAiKey,
} from '../../api/index.js'
import { useToast } from '../../components/Toast.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Field, Input, Select } from '../../components/ui/Field.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { THEME_OPTIONS } from '../../data/options.js'
import { useApp } from '../../store/AppContext.jsx'
import { REASON_TEXT } from '../../store/recovery.js'
import styles from './Settings.module.css'

const SYNC_TEXT = {
  loading: '正在读取磁盘…',
  synced: '已写入磁盘',
  pending: '有改动待写入',
  conflict: '版本冲突，写入已停止',
  error: '写入失败',
  offline: '本地服务未启动',
}

const SYNC_TONE = {
  loading: 'gray',
  synced: 'green',
  pending: 'amber',
  conflict: 'red',
  error: 'red',
  offline: 'amber',
}

function formatBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// SSR 和「服务没起来」时拿不到服务端的预设表，至少让下拉框渲染得出官方那一项。
// 只此一项，不是把服务端那张表抄一份。
const FALLBACK_PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    baseUrl: '',
    compatMode: false,
    models: ['claude-opus-4-8'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
]

export function Settings() {
  const { state, actions, sync, ai: aiState } = useApp()
  const toast = useToast()

  const [commands, setCommands] = useState({ defaults: [], custom: [], allowed: [] })
  const [configDir, setConfigDir] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [pendingCommand, setPendingCommand] = useState(null)
  const [commandInput, setCommandInput] = useState('')
  const [commandNote, setCommandNote] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [importJson, setImportJson] = useState(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [seedOpen, setSeedOpen] = useState(false)

  const [ai, setAi] = useState(null)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiModelInput, setAiModelInput] = useState(FALLBACK_PROVIDERS[0].models[0])
  const [aiBaseUrlInput, setAiBaseUrlInput] = useState('')
  const [aiCompatInput, setAiCompatInput] = useState(false)
  const [aiProviderId, setAiProviderId] = useState(FALLBACK_PROVIDERS[0].id)
  const [aiBusy, setAiBusy] = useState(null)

  const fileRef = useRef(null)

  const providerList = ai?.providers?.length ? ai.providers : FALLBACK_PROVIDERS
  const activeProvider =
    providerList.find((p) => p.id === aiProviderId) || providerList[0]

  const loadAi = async () => {
    const res = await getAiConfig()
    if (res?.ok) {
      setAi(res)
      setAiModelInput(res.model || res.defaultModel || FALLBACK_PROVIDERS[0].models[0])
      setAiBaseUrlInput(res.baseUrl || '')
      setAiCompatInput(Boolean(res.compatMode))
      setAiProviderId(res.providerId || FALLBACK_PROVIDERS[0].id)
    }
  }

  // 选供应商只是把几个字段填好，填完照样能改。所以只在这一处填，
  // 挂载时不填、保存时也不二次推导 —— 存下来的永远是表单里看得见的值，
  // 不会出现「界面显示 A、请求发去 B」。
  const handleProviderChange = (id) => {
    setAiProviderId(id)
    const preset = providerList.find((p) => p.id === id)
    if (!preset) return

    // null 表示「别动用户的输入框」（自定义端点那条）
    if (preset.baseUrl !== null) setAiBaseUrlInput(preset.baseUrl)
    setAiCompatInput(Boolean(preset.compatMode))
    if (preset.models?.length) setAiModelInput(preset.models[0])
  }

  const handleSaveAi = async () => {
    setAiBusy('saving')
    const patch = {
      model: aiModelInput,
      baseUrl: aiBaseUrlInput.trim(),
      compatMode: aiCompatInput,
    }
    // 留空表示「不改 key」，避免误把已存的 key 清掉
    if (aiKeyInput.trim()) patch.apiKey = aiKeyInput.trim()
    const res = await saveAiConfig(patch)
    setAiBusy(null)

    if (res?.ok) {
      setAi(res)
      setAiKeyInput('')
      // 让首屏那条引导横幅跟着消失，否则用户配完回首页它还挂着
      aiState.refresh()
      toast.success('已保存。下次生成知识点就会用真实模型。')
    } else {
      toast.error(res?.message || '保存失败')
    }
  }

  const handleTestAi = async () => {
    setAiBusy('testing')
    // 输入框里填了就先测这一把，没填就测已保存的
    const res = await testAiKey({
      apiKey: aiKeyInput.trim(),
      model: aiModelInput,
      baseUrl: aiBaseUrlInput.trim(),
      compatMode: aiCompatInput,
    })
    setAiBusy(null)

    if (res?.ok) {
      toast.success(`连接正常：${res.displayName || res.model}`)
    } else {
      toast.error(`${res?.message || '测试失败'}${res?.code ? `（${res.code}）` : ''}`)
    }
  }

  const handleClearAiKey = async () => {
    const res = await saveAiConfig({ apiKey: '' })
    if (res?.ok) {
      setAi(res)
      aiState.refresh()
      toast.success('已移除 API key，回到本地模拟数据')
    } else {
      toast.error(res?.message || '移除失败')
    }
  }

  const loadCommands = async () => {
    const res = await listCommands()
    if (res?.ok) {
      setCommands({
        defaults: res.defaults || [],
        custom: res.custom || [],
        allowed: res.allowed || [],
      })
      setConfigDir(res.configDir || '')
    } else {
      toast.error(res?.message || '读取可信命令列表失败，确认本地服务在运行。')
    }
  }

  useEffect(() => {
    loadCommands()
    loadAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddCategory = () => {
    const res = actions.addCategory(newCategory)
    if (res.ok) {
      toast.success(`已添加类别「${newCategory.trim()}」`)
      setNewCategory('')
    } else {
      toast.warn(res.message)
    }
  }

  const handleRemoveCategory = (name) => {
    const res = actions.removeCategory(name)
    if (res.ok) toast.success(`已移除「${name}」`)
    else toast.warn(res.message)
  }

  const handlePickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const preview = actions.previewImport(String(reader.result))
        setImportJson(String(reader.result))
        setImportPreview(preview)
      } catch (err) {
        toast.error(`导入失败：${err.message}`)
      }
    }
    reader.onerror = () => toast.error('读不到这个文件')
    reader.readAsText(file)
  }

  const runImport = (mode) => {
    try {
      actions.importData(importJson, mode)
      toast.success(mode === 'replace' ? '已用文件里的数据覆盖' : '已合并到现有数据')
      setImportPreview(null)
      setImportJson(null)
    } catch (err) {
      toast.error(`导入失败：${err.message}`)
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1>设置</h1>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>AI 生成</h2>
        <p className={styles.sectionDesc}>
          拆解项目、生成知识点这些都靠模型。不接也能用 —— 会退回本地模拟数据。
          下面是三步：选一个供应商、贴上自己的 key、测一下再保存。key 只存在你这台机器上。
        </p>

        <div className={styles.statusCard}>
          <div className={styles.statusHead}>
            <span className={styles.statusLabel}>当前状态</span>
            <Badge tone={ai?.configured ? 'green' : 'amber'} dot>
              {ai?.configured ? `已接入 ${ai.model}` : '本地模拟数据'}
            </Badge>
            {ai?.configured && activeProvider && (
              <span className={styles.aiFrom}>{activeProvider.label}</span>
            )}
            {ai?.source === 'env' && (
              <span className={styles.aiFrom}>来自环境变量 ANTHROPIC_API_KEY</span>
            )}
          </div>

          <div className={styles.aiForm}>
            <Field
              label="1. 供应商"
              hint="选一个只是把下面的地址和选项填好，填完还能改。"
            >
              <Select
                value={aiProviderId}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providerList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="2. API key"
              hint={
                ai?.configured
                  ? `已配置：${ai.keyHint}。留空表示不改动；填新的会直接覆盖。`
                  : '留空则继续用模拟数据。'
              }
            >
              <Input
                type="password"
                value={aiKeyInput}
                autoComplete="off"
                onChange={(e) => setAiKeyInput(e.target.value)}
                placeholder={
                  ai?.configured
                    ? `${activeProvider?.keyPrefix || ''}…（不改动就留空）`
                    : `${activeProvider?.keyPrefix || ''}…`
                }
              />
              {activeProvider?.keyUrl && (
                <a
                  className={styles.keyLink}
                  href={activeProvider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  去 {activeProvider.label} 拿 key →
                </a>
              )}
            </Field>

            <div className={styles.statusActions}>
              <Button size="sm" onClick={handleTestAi} disabled={aiBusy !== null}>
                {aiBusy === 'testing' ? '测试中…' : '测试连接'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleSaveAi}
                disabled={aiBusy !== null}
              >
                {aiBusy === 'saving' ? '保存中…' : '保存'}
              </Button>
              {ai?.configured && ai?.source === 'config' && (
                <Button
                  size="sm"
                  variant="dangerGhost"
                  onClick={handleClearAiKey}
                  disabled={aiBusy !== null}
                >
                  移除 key
                </Button>
              )}
            </div>

            {/* 用原生 details：内容始终在 DOM 里（SSR 冒烟测试直接查 HTML 字符串），
                浏览器里默认收起。折叠状态不占 state，也就不会因为不跑 effect 而消失。 */}
            <details className={styles.advanced}>
              <summary>高级：端点地址、模型、兼容模式</summary>
              <div className={styles.advancedBody}>
              <Field
                label="模型"
                hint="默认用能力最强的 Opus 4.8。换更便宜的型号由你自己决定，这里不做默认降级。"
              >
                <Input
                  list="ai-model-presets"
                  value={aiModelInput}
                  onChange={(e) => setAiModelInput(e.target.value)}
                  placeholder={activeProvider?.models?.[0] || '模型 ID'}
                />
                <datalist id="ai-model-presets">
                  {(activeProvider?.models || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>

              <Field
                label="端点地址"
                hint={`留空用官方端点 ${ai?.defaultBaseUrl || 'https://api.anthropic.com'}。需要走代理才填这里 —— 应用不会跟随 shell 里的 ANTHROPIC_BASE_URL。`}
              >
                <Input
                  value={aiBaseUrlInput}
                  onChange={(e) => setAiBaseUrlInput(e.target.value)}
                  placeholder="https://api.anthropic.com"
                />
              </Field>

              <Field
                label="兼容模式"
                hint="端点不认识结构化输出（output_config）时打开 —— 多数第三方兼容端点都是。打开后改成把返回格式写进提示词、自己解析 JSON：能用，但没有硬保证。官方端点不要开。"
              >
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={aiCompatInput}
                    onChange={(e) => setAiCompatInput(e.target.checked)}
                  />
                  <span>这个端点不支持结构化输出</span>
                </label>
                {/* 便宜的兜底：这组合几乎肯定是选错了，但不在服务端拦 —— 那会拒掉别人的合法配置 */}
                {aiCompatInput && !aiBaseUrlInput.trim() && (
                  <p className={styles.fieldWarn}>
                    开了兼容模式却没填端点地址，请求还是发去官方端点。确认一下是不是选错了供应商。
                  </p>
                )}
              </Field>
              </div>
            </details>
          </div>

          <p className={styles.statusNote}>
            key 写在本机配置文件里，只由本地服务用来调接口，
            <strong>不会返回给浏览器</strong> —— 上面显示的也只是头尾几位。
            凭据可以用 <code>ANTHROPIC_API_KEY</code> 环境变量代替（配置文件里的优先），
            但<strong>端点地址不跟随环境变量</strong>：很多人为别的工具在 shell 里设了
            <code>ANTHROPIC_BASE_URL</code>，应用被带偏的话请求会发去第三方端点，报错还看不出原因。
            <br />
            费用按量计，单价看你选的端点。接第三方端点时，如果它不认识 Anthropic 的结构化输出，
            需要打开上面的兼容模式。
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>外观</h2>
        <Field label="主题" hint="深色模式只是换一套配色，内容完全一样">
          <Select
            className={styles.narrow}
            value={state.settings.theme}
            onChange={(e) => actions.updateSettings({ theme: e.target.value })}
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>项目类别</h2>
        <p className={styles.sectionDesc}>
          新建项目时可选。已经用在项目上的类别不能删，得先把项目改到别的类别。
        </p>

        <ul className={styles.categoryList}>
          {state.settings.categories.map((c) => {
            const used = state.projects.filter((p) => p.category === c).length
            return (
              <li key={c}>
                <span className={styles.categoryName}>{c}</span>
                <span className={styles.categoryUsed}>
                  {used > 0 ? `${used} 个项目在用` : '暂未使用'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(c)}
                  disabled={used > 0 || state.settings.categories.length <= 1}
                  aria-label={`删除类别 ${c}`}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>

        <div className={styles.addRow}>
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCategory()
              }
            }}
            placeholder="新类别名称"
          />
          <Button onClick={handleAddCategory} disabled={!newCategory.trim()}>
            添加
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>高级：自定义可信命令</h2>
        <p className={styles.sectionDesc}>
          命令行类型的 Agent 必须命中允许列表。下面是默认项，你可能用到的个人工具可以自己加进来。
        </p>

        <div className={styles.commandGroup}>
          <h3 className={styles.commandLabel}>默认允许</h3>
          <div className={styles.chips}>
            {commands.defaults.map((c) => (
              <span key={c} className={styles.chip}>
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.commandGroup}>
          <h3 className={styles.commandLabel}>我添加的</h3>
          {commands.custom.length === 0 ? (
            <p className={styles.emptyLine}>还没有添加自定义命令。</p>
          ) : (
            <ul className={styles.customList}>
              {commands.custom.map((c) => (
                <li key={c.command}>
                  <code>{c.command}</code>
                  {c.note && <span className={styles.customNote}>{c.note}</span>}
                  <button
                    type="button"
                    aria-label={`移除 ${c.command}`}
                    onClick={async () => {
                      const res = await removeCustomCommand(c.command)
                      if (res.ok) {
                        toast.success(`已移除「${c.command}」`)
                        loadCommands()
                      } else {
                        toast.error(res.message || '移除失败')
                      }
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.addRow}>
          <Input
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="命令名，例如 uv"
          />
          <Input
            value={commandNote}
            onChange={(e) => setCommandNote(e.target.value)}
            placeholder="备注（可选）"
          />
          <Button
            disabled={!commandInput.trim()}
            onClick={() => {
              setPendingCommand({ command: commandInput.trim(), note: commandNote.trim() })
            }}
          >
            添加命令
          </Button>
        </div>

        {configDir && (
          <p className={styles.configPath}>
            自定义项存在本地配置文件：<code>{configDir}</code>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>数据</h2>

        <div className={styles.statusCard}>
          <div className={styles.statusHead}>
            <span className={styles.statusLabel}>保存状态</span>
            <Badge tone={SYNC_TONE[sync.status] || 'gray'} dot>
              {SYNC_TEXT[sync.status] || sync.status}
            </Badge>
          </div>

          <dl className={styles.statusGrid}>
            <div>
              <dt>数据文件</dt>
              <dd className={styles.mono}>
                {sync.disk.dataFile || sync.disk.dataDir || '（本地服务未启动）'}
              </dd>
            </div>
            <div>
              <dt>文件版本</dt>
              <dd className="num">第 {sync.disk.revision || 0} 版</dd>
            </div>
            <div>
              <dt>最后写入</dt>
              <dd className="num">{formatTime(sync.disk.savedAt || sync.lastSaveAt)}</dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd className="num">{formatBytes(sync.disk.bytes)}</dd>
            </div>
          </dl>

          {/* 启动时到底发生了什么。尤其是「浏览器数据被清了，已从磁盘恢复」这种
              静默发生的分支，不写出来用户永远不知道。 */}
          {sync.reason && REASON_TEXT[sync.reason] && (
            <p className={styles.statusReason}>本次启动：{REASON_TEXT[sync.reason]}</p>
          )}

          {sync.error && <p className={styles.statusError}>{sync.error}</p>}

          {sync.disk.corrupt && (
            <p className={styles.statusError}>
              磁盘上的数据文件解析失败（{sync.disk.corrupt}）。
              原始内容已另存到 {sync.disk.preservedAt || 'data.corrupt.json'}，没有被覆盖。
            </p>
          )}

          <div className={styles.statusActions}>
            <Button
              size="sm"
              onClick={sync.saveNow}
              disabled={!sync.disk.available}
              title="立刻把当前数据写进磁盘文件"
            >
              立即保存
            </Button>
            <Button
              size="sm"
              onClick={sync.requestReload}
              disabled={!sync.disk.available}
              title="会先确认一次，因为这会丢掉本地未写入的改动"
            >
              从磁盘重新加载
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={sync.openDataDir}
              disabled={!sync.disk.available}
            >
              打开数据目录
            </Button>
          </div>

          <p className={styles.statusNote}>
            每次改动会在 0.6 秒后自动写入磁盘。浏览器里同时留一份镜像，
            万一没来得及写磁盘，下次打开会提示你恢复。
          </p>
        </div>

        <div className={styles.dataRow}>
          <div>
            <strong>导出</strong>
            <p className={styles.dataDesc}>
              把全部项目、任务、知识点、Agent 配置打包成一个 JSON 文件。
            </p>
          </div>
          <Button
            onClick={() => {
              const payload = actions.downloadExport()
              toast.success(`已导出 ${payload.projects.length} 个项目`)
            }}
          >
            导出 JSON
          </Button>
        </div>

        <div className={styles.dataRow}>
          <div>
            <strong>导入</strong>
            <p className={styles.dataDesc}>
              选一个之前导出的 JSON。会先显示里面有什么，再决定覆盖还是合并。
            </p>
          </div>
          <Button onClick={() => fileRef.current?.click()}>选择文件</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handlePickFile}
          />
        </div>

        <div className={styles.dataRow}>
          <div>
            <strong>导入示例项目</strong>
            <p className={styles.dataDesc}>
              加三个示例项目（街拍摄影作业 / 菜谱小程序 / 旧物交换调研），用来快速看看这个工作台长什么样。
            </p>
          </div>
          <Button onClick={() => setSeedOpen(true)}>导入示例</Button>
        </div>

        <div className={styles.dataRow}>
          <div>
            <strong className={styles.dangerText}>清空所有数据</strong>
            <p className={styles.dataDesc}>
              删掉这个浏览器里保存的全部内容。清之前建议先导出一份。
            </p>
          </div>
          <Button variant="dangerGhost" onClick={() => setResetOpen(true)}>
            清空
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>关于</h2>
        <p className={styles.about}>
          AI 创作项目工作台 · 本地运行的第一版。
          <br />
          改动会自动保存到本机的数据文件（路径见上方），浏览器里同时留一份镜像，
          没来得及写进磁盘时，下次打开会提示你恢复。仍然建议定期导出 JSON 备份 ——
          换机器或重装系统时，数据文件不会跟着走。
          <br />
          本地服务负责：读写数据文件、启动程序、打开文件选择器、生成知识点建议（当前是模拟实现）。
        </p>
      </section>

      {/* 自定义命令的风险提示 */}
      <Modal
        open={Boolean(pendingCommand)}
        onClose={() => setPendingCommand(null)}
        title="添加自定义可信命令"
        width={520}
        footer={
          <>
            <div className={styles.spacer} />
            <Button variant="ghost" onClick={() => setPendingCommand(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const res = await addCustomCommand(pendingCommand.command, pendingCommand.note)
                if (res.ok) {
                  toast.success(`已添加「${pendingCommand.command}」`)
                  setCommandInput('')
                  setCommandNote('')
                  setPendingCommand(null)
                  loadCommands()
                } else {
                  toast.error(res.message || '添加失败')
                }
              }}
            >
              确认添加
            </Button>
          </>
        }
      >
        <p className={styles.risk}>
          加入允许列表后，命令行类型的 Agent 就能启动
          <code>{pendingCommand?.command}</code>。
        </p>
        <ul className={styles.riskList}>
          <li>只加你信任的、自己会用的命令。</li>
          <li>命令是以参数数组直接启动的，不经过 shell，不会被拼成别的指令。</li>
          <li>真正要小心的是命令本身能干什么 —— 别把带破坏性的工具加进来。</li>
        </ul>
      </Modal>

      {/* 导入预览 */}
      <Modal
        open={Boolean(importPreview)}
        onClose={() => {
          setImportPreview(null)
          setImportJson(null)
        }}
        title="确认导入"
        description="先看看文件里有什么，再决定怎么处理。"
        width={480}
        footer={
          <>
            <div className={styles.spacer} />
            <Button
              variant="ghost"
              onClick={() => {
                setImportPreview(null)
                setImportJson(null)
              }}
            >
              取消
            </Button>
            <Button onClick={() => runImport('merge')}>合并到现有数据</Button>
            <Button variant="primary" onClick={() => runImport('replace')}>
              覆盖现有数据
            </Button>
          </>
        }
      >
        {importPreview && (
          <ul className={styles.preview}>
            <li>
              <span>项目</span>
              <strong className="num">{importPreview.projects}</strong>
            </li>
            <li>
              <span>任务</span>
              <strong className="num">{importPreview.tasks}</strong>
            </li>
            <li>
              <span>知识点</span>
              <strong className="num">{importPreview.concepts}</strong>
            </li>
            <li>
              <span>知识点关联</span>
              <strong className="num">{importPreview.relations}</strong>
            </li>
            <li>
              <span>Agent</span>
              <strong className="num">{importPreview.agents}</strong>
            </li>
          </ul>
        )}
        <p className={styles.previewNote}>
          「合并」会保留现有数据，只补充 id 不重复的条目；「覆盖」会清掉现在全部内容。
        </p>
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          actions.resetAll()
          toast.success('已清空，回到初始状态')
        }}
        title="清空所有数据"
        message={`会删掉 ${state.projects.length} 个项目、${state.knowledgeConcepts.length} 个知识点，不可恢复。`}
        confirmLabel="确认清空"
        requireText="清空"
      />

      <ConfirmDialog
        open={seedOpen}
        onClose={() => setSeedOpen(false)}
        onConfirm={() => {
          const summary = actions.loadSeed()
          toast.success(`已导入 ${summary.projects} 个示例项目`)
        }}
        title="导入示例项目"
        message="会往现有数据里加三个示例项目，不会覆盖你已经建的内容。"
        confirmLabel="导入"
        tone="primary"
      />
    </>
  )
}
