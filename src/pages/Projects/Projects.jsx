import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ProjectCard, ProjectRow } from '../../components/ProjectCard.jsx'
import { ProjectFormModal } from '../../components/ProjectFormModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ConfirmDialog } from '../../components/ui/Modal.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input, Select } from '../../components/ui/Field.jsx'
import {
  PRIORITY,
  PRIORITY_ORDER,
  PROJECT_STATUS,
  PROJECT_STATUS_ORDER,
} from '../../data/options.js'
import { getDeadlineInfo } from '../../domain/deadline.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './Projects.module.css'

const SORTS = [
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '创建时间' },
  { value: 'due', label: '截止日期' },
  { value: 'priority', label: '优先级' },
  { value: 'name', label: '名称' },
]

const DEADLINES = [
  { value: 'overdue', label: '已逾期' },
  { value: '3d', label: '3 天内' },
  { value: '7d', label: '7 天内' },
  { value: '30d', label: '30 天内' },
]

function matchDeadline(project, key) {
  const info = getDeadlineInfo(project.dueDate)
  if (info.level === 'none') return false
  if (key === 'overdue') return info.level === 'overdue'
  if (key === '3d') return info.days >= 0 && info.days <= 3
  if (key === '7d') return info.days >= 0 && info.days <= 7
  if (key === '30d') return info.days >= 0 && info.days <= 30
  return true
}

function sortProjects(list, sort) {
  const arr = [...list]
  switch (sort) {
    case 'created':
      return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    case 'due':
      return arr.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate < b.dueDate ? -1 : 1
      })
    case 'priority':
      return arr.sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
          (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      )
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    default:
      return arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }
}

export function Projects() {
  const { state, actions } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const q = params.get('q') || ''
  const category = params.get('category') || 'all'
  const status = params.get('status') || 'all'
  const priority = params.get('priority') || 'all'
  const deadline = params.get('deadline') || 'all'
  const view = params.get('view') || 'grid'
  const sort = params.get('sort') || 'updated'
  const showArchived = params.get('archived') === '1'

  const setParam = (key, value, def = '') => {
    const next = new URLSearchParams(params)
    if (value === def || value === null || value === undefined) next.delete(key)
    else next.set(key, String(value))
    setParams(next, { replace: true })
  }

  const hasFilter =
    q || category !== 'all' || status !== 'all' || priority !== 'all' || deadline !== 'all'

  const clearFilters = () => {
    const next = new URLSearchParams()
    if (view !== 'grid') next.set('view', view)
    if (showArchived) next.set('archived', '1')
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let list = state.projects.filter((p) => (showArchived ? true : !p.archived))

    if (kw) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          (p.description || '').toLowerCase().includes(kw) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(kw)),
      )
    }
    if (category !== 'all') list = list.filter((p) => p.category === category)
    if (status !== 'all') list = list.filter((p) => p.status === status)
    if (priority !== 'all') list = list.filter((p) => p.priority === priority)
    if (deadline !== 'all') list = list.filter((p) => matchDeadline(p, deadline))

    return sortProjects(list, sort)
  }, [state.projects, q, category, status, priority, deadline, sort, showArchived])

  const handlers = {
    onEdit: (project) => {
      setEditing(project)
      setFormOpen(true)
    },
    onDuplicate: (project) => {
      const copy = actions.duplicateProject(project.id)
      if (copy) toast.success(`已复制为「${copy.name}」`)
    },
    onArchive: (project) => {
      actions.setProjectArchived(project.id, !project.archived)
      toast.success(project.archived ? '已取消归档' : '已归档')
    },
    onDelete: (project) => setDeleting(project),
  }

  const confirmDelete = () => {
    if (!deleting) return
    actions.deleteProject(deleting.id)
    toast.success(`已删除「${deleting.name}」`)
    setDeleting(null)
  }

  const deleteImpact = useMemo(() => {
    if (!deleting) return null
    const tasks = state.tasks.filter((t) => t.projectId === deleting.id).length
    const links = state.projectKnowledge.filter((k) => k.projectId === deleting.id).length
    const resources = state.resources.filter((r) => r.projectId === deleting.id).length
    return { tasks, links, resources }
  }, [deleting, state])

  if (state.projects.length === 0) {
    return (
      <>
        <header className={styles.head}>
          <h1>项目中心</h1>
        </header>
        <EmptyState
          icon="▤"
          title="还没有项目"
          description="创建第一个项目，或者先导入示例数据看看这个工作台能做什么。"
        >
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            新建项目
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const summary = actions.loadSeed()
              toast.success(`已导入 ${summary.projects} 个示例项目`)
            }}
          >
            导入示例项目
          </Button>
        </EmptyState>
        <ProjectFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          project={editing}
          onSaved={(id) => navigate(`/projects/${id}`)}
        />
      </>
    )
  }

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1>项目中心</h1>
          <p className={styles.sub}>
            {hasFilter ? (
              <>
                找到 <strong className="num">{filtered.length}</strong> 个项目
                <button type="button" className={styles.clear} onClick={clearFilters}>
                  清除全部筛选
                </button>
              </>
            ) : (
              <>
                共 <strong className="num">{state.projects.length}</strong> 个项目
              </>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          icon="+"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          新建项目
        </Button>
      </header>

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="搜索项目名、描述或标签"
          aria-label="搜索项目"
        />

        <div className={styles.viewToggle} role="group" aria-label="视图切换">
          <button
            type="button"
            data-active={view === 'grid'}
            onClick={() => setParam('view', 'grid', 'grid')}
          >
            卡片
          </button>
          <button
            type="button"
            data-active={view === 'list'}
            onClick={() => setParam('view', 'list', 'grid')}
          >
            列表
          </button>
        </div>

        <Select
          className={styles.sort}
          value={sort}
          onChange={(e) => setParam('sort', e.target.value, 'updated')}
          aria-label="排序方式"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              排序：{s.label}
            </option>
          ))}
        </Select>
      </div>

      <div className={styles.filters}>
        <FilterGroup
          label="类别"
          value={category}
          onChange={(v) => setParam('category', v, 'all')}
          options={state.settings.categories.map((c) => ({ value: c, label: c }))}
        />
        <FilterGroup
          label="状态"
          value={status}
          onChange={(v) => setParam('status', v, 'all')}
          options={PROJECT_STATUS_ORDER.map((s) => ({
            value: s,
            label: PROJECT_STATUS[s].label,
          }))}
        />
        <FilterGroup
          label="优先级"
          value={priority}
          onChange={(v) => setParam('priority', v, 'all')}
          options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY[p].label }))}
        />
        <FilterGroup
          label="截止"
          value={deadline}
          onChange={(v) => setParam('deadline', v, 'all')}
          options={DEADLINES}
        />
        <label className={styles.archiveToggle}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setParam('archived', e.target.checked ? '1' : '', '')}
          />
          <span>显示已归档</span>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="没有符合条件的项目"
          description="换个关键词，或者清掉部分筛选条件再试。"
        >
          <Button onClick={clearFilters}>清除全部筛选</Button>
        </EmptyState>
      ) : view === 'grid' ? (
        <div className={styles.grid}>
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} handlers={handlers} />
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>项目</th>
                <th>类别</th>
                <th>状态</th>
                <th>优先级</th>
                <th>进度</th>
                <th>截止</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProjectRow key={p.id} project={p} handlers={handlers} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        project={editing}
        onSaved={(id) => {
          if (!editing) navigate(`/projects/${id}`)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="删除项目"
        message="这个操作不可撤销。"
        confirmLabel="删除"
        requireText={deleting?.name}
      >
        {deleteImpact && (
          <ul className={styles.impact}>
            <li>
              将同时删除 <strong className="num">{deleteImpact.tasks}</strong> 个任务
            </li>
            <li>
              移除 <strong className="num">{deleteImpact.links}</strong> 个知识点关联
            </li>
            <li>
              删除 <strong className="num">{deleteImpact.resources}</strong> 条项目资料
            </li>
            <li className={styles.impactSafe}>知识点本身会保留在知识库，不受影响</li>
          </ul>
        )}
      </ConfirmDialog>
    </>
  )
}

function FilterGroup({ label, value, onChange, options }) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.chips}>
        <button
          type="button"
          data-active={value === 'all'}
          onClick={() => onChange('all')}
        >
          全部
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-active={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
