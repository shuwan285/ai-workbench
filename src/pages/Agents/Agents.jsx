import { useState } from 'react'
import { AgentFormModal } from '../../components/AgentFormModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { AGENT_TYPE } from '../../data/options.js'
import { agentOptionsFrom, agentTarget, isAgentConfigured } from '../../domain/agents.js'
import { useAgentLaunch } from '../../hooks/useAgentLaunch.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './Agents.module.css'

const PRESETS = [
  {
    name: 'ChatGPT',
    icon: '🤖',
    url: 'https://chatgpt.com',
    description: '通用问答、头脑风暴、改代码',
  },
  {
    name: 'Claude',
    icon: '✳️',
    url: 'https://claude.ai',
    description: '长文本写作、论文润色、复杂推理',
  },
]

export function Agents() {
  const { state, actions } = useApp()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const agents = agentOptionsFrom(state)
  const { launch } = useAgentLaunch({
    onNeedConfig: () => toast.info('在下面的列表里点「编辑」就能补上。'),
  })

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (agent) => {
    setEditing(agent)
    setFormOpen(true)
  }

  const addPreset = (preset) => {
    if (agents.some((a) => a.name === preset.name)) {
      toast.warn(`已经有「${preset.name}」了`)
      return
    }
    actions.createAgent({
      name: preset.name,
      icon: preset.icon,
      category: '对话',
      type: 'web',
      url: preset.url,
      description: preset.description,
      isPinned: true,
    })
    toast.success(`已添加「${preset.name}」`)
  }

  const projectName = (id) => state.projects.find((p) => p.id === id)?.name

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1>Agent 管理</h1>
          <p className={styles.sub}>
            配好之后可以一键打开。网页版直接开新标签，桌面应用和命令行交给本地服务启动。
          </p>
        </div>
        <Button variant="primary" icon="+" onClick={openNew}>
          新增 Agent
        </Button>
      </header>

      {agents.length === 0 ? (
        <EmptyState
          icon="◇"
          title="还没有配置 Agent"
          description="先加上最常用的两个，之后随时可以改成桌面客户端或本地命令。"
        >
          {PRESETS.map((p) => (
            <Button key={p.name} variant="primary" onClick={() => addPreset(p)}>
              {p.icon} 添加 {p.name}
            </Button>
          ))}
          <Button variant="ghost" onClick={openNew}>
            + 自定义 Agent
          </Button>
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {agents.map((agent) => {
            const meta = AGENT_TYPE[agent.type] || AGENT_TYPE.web
            const ok = isAgentConfigured(agent)
            const target = agentTarget(agent)

            return (
              <li key={agent.id} className={styles.item} data-unconfigured={!ok}>
                <div className={styles.itemHead}>
                  <span className={styles.icon} aria-hidden="true">
                    {agent.icon}
                  </span>
                  <span className={styles.name}>{agent.name}</span>
                  <Badge tone={meta.tone}>
                    {meta.icon} {meta.label}
                  </Badge>
                  {agent.isPinned && <Badge tone="gray">📌 首页</Badge>}

                  <div className={styles.actions}>
                    <Button size="sm" onClick={() => launch(agent)}>
                      测试打开
                    </Button>
                    <Menu
                      ariaLabel={`${agent.name} 的操作`}
                      items={[
                        { label: '编辑', onClick: () => openEdit(agent) },
                        {
                          label: agent.isPinned ? '取消首页固定' : '固定到首页',
                          onClick: () =>
                            actions.updateAgent(agent.id, { isPinned: !agent.isPinned }),
                        },
                        {
                          label: '删除',
                          tone: 'danger',
                          onClick: () => setDeleting(agent),
                        },
                      ]}
                    />
                  </div>
                </div>

                <dl className={styles.meta}>
                  <dt>{agent.type === 'web' ? '网址' : agent.type === 'desktop' ? '路径' : '命令'}</dt>
                  <dd className={styles.target}>
                    {target || <span className={styles.missing}>（未配置）</span>}
                  </dd>
                </dl>

                {agent.description && <p className={styles.desc}>{agent.description}</p>}

                {(agent.projectIds || []).length > 0 && (
                  <p className={styles.projects}>
                    关联项目：
                    {agent.projectIds.map((id) => projectName(id)).filter(Boolean).join('、')}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AgentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        agent={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          actions.deleteAgent(deleting.id)
          toast.success(`已删除「${deleting.name}」`)
        }}
        title="删除 Agent"
        message={deleting?.name}
        confirmLabel="删除"
      >
        <p className={styles.deleteNote}>
          只会删掉这里的配置，不影响你电脑上的程序。
        </p>
      </ConfirmDialog>
    </>
  )
}
