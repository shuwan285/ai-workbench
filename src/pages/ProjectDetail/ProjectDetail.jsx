import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { PRIORITY, PROJECT_STATUS } from '../../data/options.js'
import { blockingItemsOfProject } from '../../domain/blocking.js'
import { getDeadlineInfo } from '../../domain/deadline.js'
import { progressDetail } from '../../domain/progress.js'
import { useApp } from '../../store/AppContext.jsx'
import { AgentTab } from './AgentTab.jsx'
import { KnowledgeTab } from './KnowledgeTab.jsx'
import { OverviewTab } from './OverviewTab.jsx'
import { ResourcesTab } from './ResourcesTab.jsx'
import { RoadmapTab } from './RoadmapTab.jsx'
import { TasksTab } from './TasksTab.jsx'
import styles from './ProjectDetail.module.css'

// 第一项是打开项目时默认显示的。执行路线放在最前，是因为
// 「现在该做哪一步、这一步要先补什么」是打开项目最常问的问题。
const TABS = [
  { key: 'roadmap', label: '执行路线' },
  { key: 'overview', label: '概览' },
  { key: 'tasks', label: '任务与进度' },
  { key: 'knowledge', label: '知识点清单' },
  { key: 'agent', label: 'Agent 工作区' },
  { key: 'resources', label: '项目资料' },
]

const DEFAULT_TAB = TABS[0].key

export function ProjectDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { state, actions } = useApp()

  const project = state.projects.find((p) => p.id === id)

  const blockingItems = useMemo(
    () => (project ? blockingItemsOfProject(project.id, state.projectKnowledge) : []),
    [project, state.projectKnowledge],
  )

  // 关闭状态记在会话里；知识点状态一变，签名就变，提醒重新出现
  const blockingSignature = useMemo(
    () =>
      blockingItems
        .map((k) => `${k.id}:${k.status}`)
        .sort()
        .join('|'),
    [blockingItems],
  )

  const dismissKey = `aiwb:blockDismiss:${id}`
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(dismissKey))
  const [deleteOpen, setDeleteOpen] = useState(false)

  const conceptNameById = useMemo(() => {
    const map = {}
    for (const c of state.knowledgeConcepts) map[c.id] = c.name
    return map
  }, [state.knowledgeConcepts])

  const blockingNames = useMemo(
    () => blockingItems.map((k) => conceptNameById[k.conceptId]).filter(Boolean).join('、'),
    [blockingItems, conceptNameById],
  )

  useEffect(() => {
    if (!dismissed) return
    if (dismissed !== blockingSignature) {
      sessionStorage.removeItem(dismissKey)
      setDismissed(null)
    }
  }, [blockingSignature, dismissed, dismissKey])

  const tab = params.get('tab') || DEFAULT_TAB
  const setTab = (key) => {
    const next = new URLSearchParams(params)
    if (key === DEFAULT_TAB) next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  if (!project) {
    return (
      <EmptyState
        icon="✕"
        title="找不到这个项目"
        description="它可能已经被删除了。"
      >
        <Button onClick={() => navigate('/projects')}>回项目中心</Button>
      </EmptyState>
    )
  }

  const detail = progressDetail(project, state.tasks)
  const status = PROJECT_STATUS[project.status] || PROJECT_STATUS.idea
  const priority = PRIORITY[project.priority] || PRIORITY.medium
  const deadline = getDeadlineInfo(project.dueDate)

  return (
    <>
      <Link to="/projects" className={styles.back}>
        ← 项目中心
      </Link>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span
            className={styles.colorBar}
            style={{ background: project.coverColor }}
            aria-hidden="true"
          />
          <h1 className={styles.title}>{project.name}</h1>

          <div className={styles.headerActions}>
            <Button
              size="sm"
              onClick={() => {
                const next = window.prompt('项目名称', project.name)
                if (next && next.trim() && next !== project.name) {
                  actions.updateProject(project.id, { name: next.trim() })
                  toast.success('已重命名')
                }
              }}
            >
              重命名
            </Button>
            <Menu
              ariaLabel="项目操作"
              items={[
                {
                  label: project.archived ? '取消归档' : '归档',
                  onClick: () => {
                    actions.setProjectArchived(project.id, !project.archived)
                    toast.success(project.archived ? '已取消归档' : '已归档')
                  },
                },
                {
                  label: '删除项目',
                  tone: 'danger',
                  onClick: () => setDeleteOpen(true),
                },
              ]}
            />
          </div>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.category}>{project.category}</span>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          <Badge tone={priority.tone}>
            {priority.symbol} {priority.label}
          </Badge>
          {project.archived && <Badge tone="gray">已归档</Badge>}
          {(project.tags || []).map((t) => (
            <span key={t} className={styles.tag}>
              #{t}
            </span>
          ))}
        </div>

        <div className={styles.progressRow}>
          <div className={styles.progressBar}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                data-tone={project.status === 'done' ? 'green' : 'blue'}
                style={{ width: `${detail.value}%` }}
              />
            </div>
            <span className={`${styles.progressText} num`}>
              {detail.value}%
              {detail.hasTasks && detail.mode === 'auto' && (
                <span className={styles.progressSub}>
                  （{detail.done}/{detail.total} 任务）
                </span>
              )}
            </span>
            {detail.mode === 'manual' && <Badge tone="amber">手动</Badge>}
          </div>

          <div className={styles.nextAction}>
            <span className={styles.nextLabel}>下一步</span>
            <span data-empty={!project.nextAction}>
              {project.nextAction || '还没写，去概览页补一个'}
            </span>
          </div>

          {deadline.level !== 'none' && (
            <span className={styles.deadline} data-level={deadline.level}>
              截止 {deadline.date}（{deadline.label}）
            </span>
          )}
        </div>
      </header>

      {blockingItems.length > 0 && dismissed !== blockingSignature && (
        <div className={styles.blockBanner} role="status">
          <span aria-hidden="true">⚠️</span>
          <span className={styles.blockText}>
            有 {blockingItems.length} 个阻塞知识点未掌握：
            <span className={styles.blockNames}>{blockingNames}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setTab('knowledge')}>
            去学习
          </Button>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="关闭提醒"
            onClick={() => {
              sessionStorage.setItem(dismissKey, blockingSignature)
              setDismissed(blockingSignature)
            }}
          >
            ✕
          </button>
        </div>
      )}

      <nav className={styles.tabs} role="tablist" aria-label="项目详情">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            data-active={tab === t.key}
            className={styles.tab}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabPanel} role="tabpanel">
        {tab === 'roadmap' && <RoadmapTab project={project} />}
        {tab === 'overview' && <OverviewTab project={project} />}
        {tab === 'tasks' && <TasksTab project={project} />}
        {tab === 'knowledge' && <KnowledgeTab project={project} />}
        {tab === 'agent' && <AgentTab project={project} />}
        {tab === 'resources' && <ResourcesTab project={project} />}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          actions.deleteProject(project.id)
          toast.success(`已删除「${project.name}」`)
          navigate('/projects')
        }}
        title="删除项目"
        message="这个操作不可撤销。"
        confirmLabel="删除"
        requireText={project.name}
      >
        <ul className={styles.impact}>
          <li>
            将同时删除{' '}
            <strong className="num">
              {state.tasks.filter((t) => t.projectId === project.id).length}
            </strong>{' '}
            个任务
          </li>
          <li>
            移除{' '}
            <strong className="num">
              {state.projectKnowledge.filter((k) => k.projectId === project.id).length}
            </strong>{' '}
            个知识点关联
          </li>
          <li>
            删除{' '}
            <strong className="num">
              {state.resources.filter((r) => r.projectId === project.id).length}
            </strong>{' '}
            条项目资料
          </li>
          <li className={styles.impactSafe}>知识点本身会保留在知识库，不受影响</li>
        </ul>
      </ConfirmDialog>
    </>
  )
}
