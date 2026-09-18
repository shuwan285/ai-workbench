import { useEffect, useState } from 'react'
import { listCommands, pickApplicationPath } from '../api/index.js'
import { AGENT_CATEGORIES, AGENT_ICONS, AGENT_TYPE, AGENT_TYPE_ORDER } from '../data/options.js'
import { useApp } from '../store/AppContext.jsx'
import { useToast } from './Toast.jsx'
import { Button } from './ui/Button.jsx'
import { Checkbox, Field, Input, Select, Textarea } from './ui/Field.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './AgentFormModal.module.css'

function toForm(agent) {
  return {
    name: agent?.name || '',
    icon: agent?.icon || '🤖',
    category: agent?.category || '对话',
    type: agent?.type || 'web',
    description: agent?.description || '',
    isPinned: agent?.isPinned ?? true,
    projectIds: agent?.projectIds || [],
    url: agent?.url || '',
    localPath: agent?.localPath || '',
    command: agent?.command || '',
    argsText: (agent?.args || []).join('\n'),
  }
}

export function AgentFormModal({ open, onClose, agent = null }) {
  const { state, actions } = useApp()
  const toast = useToast()
  const isEdit = Boolean(agent)

  const [form, setForm] = useState(() => toForm(agent))
  const [allowed, setAllowed] = useState({ defaults: [], allowed: [] })
  const [picking, setPicking] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(toForm(agent))
    setNameError('')
  }, [open, agent])

  useEffect(() => {
    if (!open) return
    listCommands().then((res) => {
      if (res?.ok) setAllowed({ defaults: res.defaults || [], allowed: res.allowed || [] })
    })
  }, [open])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const args = form.argsText
    .split(/\r?\n/)
    .map((a) => a.trim())
    .filter(Boolean)

  const preview = [form.command, ...args].filter(Boolean).join(' ')

  const handleBrowse = async () => {
    setPicking(true)
    const res = await pickApplicationPath()
    setPicking(false)

    if (res.ok) {
      set({ localPath: res.path })
      toast.success('已选择路径')
      return
    }
    if (res.code === 'CANCELLED') return
    if (res.code === 'PICKER_UNAVAILABLE' || res.code === 'PICKER_FAILED') {
      toast.error('当前系统没有可用的文件选择器，请手动填写路径。')
      return
    }
    toast.error(res.message || '打开文件选择器失败')
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError('名称不能为空')
      return
    }

    const payload = {
      name: form.name.trim(),
      icon: form.icon,
      category: form.category,
      type: form.type,
      description: form.description,
      isPinned: form.isPinned,
      projectIds: form.projectIds,
      url: form.type === 'web' ? form.url.trim() : '',
      localPath: form.type === 'desktop' ? form.localPath.trim() : '',
      command: form.type === 'command' ? form.command.trim() : '',
      args: form.type === 'command' ? args : [],
    }

    if (isEdit) {
      actions.updateAgent(agent.id, payload)
      toast.success('Agent 已更新')
    } else {
      actions.createAgent(payload)
      toast.success('Agent 已添加')
    }
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑 Agent' : '新增 Agent'}
      width={600}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.row}>
          <Field label="名称" required error={nameError} className={styles.grow}>
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => {
                set({ name: e.target.value })
                if (nameError) setNameError('')
              }}
              placeholder="例如：ChatGPT"
            />
          </Field>

          <Field label="类别">
            <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {AGENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="图标">
          <div className={styles.icons}>
            {AGENT_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                data-selected={form.icon === icon}
                onClick={() => set({ icon })}
                aria-label={`选择图标 ${icon}`}
                aria-pressed={form.icon === icon}
              >
                {icon}
              </button>
            ))}
          </div>
        </Field>

        <Field label="打开方式">
          <div className={styles.typeRow} role="radiogroup" aria-label="打开方式">
            {AGENT_TYPE_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.type === t}
                data-active={form.type === t}
                onClick={() => set({ type: t })}
              >
                <span aria-hidden="true">{AGENT_TYPE[t].icon}</span>
                {AGENT_TYPE[t].label}
              </button>
            ))}
          </div>
        </Field>

        {form.type === 'web' && (
          <Field label="网址" hint="点「打开」时会在新标签页里打开">
            <Input
              value={form.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://chatgpt.com"
            />
          </Field>
        )}

        {form.type === 'desktop' && (
          <Field
            label="程序路径"
            hint="Windows 选 .exe 或 .lnk；批处理文件请改用命令行方式"
          >
            <div className={styles.pathRow}>
              <Input
                value={form.localPath}
                onChange={(e) => set({ localPath: e.target.value })}
                placeholder="C:\Apps\Claude\Claude.exe"
              />
              <Button onClick={handleBrowse} disabled={picking}>
                {picking ? '选择中…' : '浏览…'}
              </Button>
            </div>
          </Field>
        )}

        {form.type === 'command' && (
          <>
            <Field
              label="命令"
              hint="必须命中允许列表。需要新命令的话，去设置页添加。"
            >
              <Input
                value={form.command}
                list="aiwb-command-options"
                onChange={(e) => set({ command: e.target.value })}
                placeholder="python"
              />
              <datalist id="aiwb-command-options">
                {allowed.allowed.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field
              label="参数"
              hint="一行一个。会在新终端窗口里运行；& | ^ < > % 这几个字符会被终端当成语法，用不了。"
            >
              <Textarea
                value={form.argsText}
                rows={3}
                onChange={(e) => set({ argsText: e.target.value })}
                placeholder={'-i\nmy_script.py'}
              />
            </Field>

            <div className={styles.preview}>
              <span className={styles.previewLabel}>实际启动</span>
              <code>{preview || '（还没填命令）'}</code>
            </div>
          </>
        )}

        <Field label="用途说明" hint="写清楚什么时候该用它，比记名字有用">
          <Textarea
            value={form.description}
            rows={2}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="例如：通用问答、头脑风暴、改代码"
          />
        </Field>

        {state.projects.length > 0 && (
          <Field label="关联项目" hint="关联后，项目详情页的 Agent 工作区会优先推荐它">
            <div className={styles.projects}>
              {state.projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <Checkbox
                    key={p.id}
                    label={p.name}
                    checked={form.projectIds.includes(p.id)}
                    onChange={(e) =>
                      set({
                        projectIds: e.target.checked
                          ? [...form.projectIds, p.id]
                          : form.projectIds.filter((id) => id !== p.id),
                      })
                    }
                  />
                ))}
            </div>
          </Field>
        )}

        <Checkbox
          label="显示在首页快捷入口"
          checked={form.isPinned}
          onChange={(e) => set({ isPinned: e.target.checked })}
        />
      </div>
    </Modal>
  )
}
