import { useMemo, useState } from 'react'
import { planProject } from '../../api/index.js'
import { PlanStepsModal } from '../../components/PlanStepsModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { PRIORITY, PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from '../../data/options.js'
import { formatDate } from '../../domain/dates.js'
import { getDeadlineInfo } from '../../domain/deadline.js'
import { allTasksDone, progressDetail } from '../../domain/progress.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './TasksTab.module.css'

const QUICK_SETS = [
  {
    label: '文献综述',
    tasks: ['检索并筛选文献', '精读核心文献', '整理对比表格', '写出综述初稿'],
  },
  {
    label: '写代码 → 调试 → 出图',
    tasks: ['搭好项目骨架', '实现核心逻辑', '跑通并调试', '整理结果输出'],
  },
  {
    label: '实验报告',
    tasks: ['整理实验数据', '画图', '写结果分析', '排版定稿'],
  },
]

function emptyTask(projectId, status) {
  return {
    projectId,
    title: '',
    description: '',
    doneWhen: '',
    status,
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
  }
}

export function TasksTab({ project }) {
  const { state, actions } = useApp()
  const toast = useToast()

  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState('board')
  const [planOpen, setPlanOpen] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  const [planSource, setPlanSource] = useState(null)
  const [planModel, setPlanModel] = useState(null)
  const [planProposal, setPlanProposal] = useState([])

  const detail = progressDetail(project, state.tasks)
  const done = allTasksDone(project, state.tasks)

  const columns = useMemo(() => {
    const mine = state.tasks.filter((t) => t.projectId === project.id)
    return TASK_STATUS_ORDER.map((key) => ({
      key,
      label: TASK_STATUS[key].label,
      tone: TASK_STATUS[key].tone,
      items: mine.filter((t) => t.status === key).sort((a, b) => a.order - b.order),
    }))
  }, [state.tasks, project.id])

  const setMode = (mode) => {
    if (mode === project.progressMode) return
    actions.updateProject(project.id, {
      progressMode: mode,
      manualProgress: mode === 'manual' ? detail.value : project.manualProgress,
    })
  }

  const handleDrop = (status, index) => {
    const id = dragId
    setDragId(null)
    setOverCol(null)
    if (!id) return
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return
    if (task.status === status) {
      const col = columns.find((c) => c.key === status)
      const currentIndex = col.items.findIndex((t) => t.id === id)
      if (currentIndex === index || currentIndex === index - 1) return
    }
    actions.moveTask(id, status, index)
  }

  const openNew = (status = 'todo') => setEditing({ isNew: true, ...emptyTask(project.id, status) })

  const openEdit = (task) =>
    setEditing({
      isNew: false,
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description || '',
      doneWhen: task.doneWhen || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate || '',
      estimatedHours: task.estimatedHours ?? '',
    })

  const saveTask = () => {
    if (!editing) return
    if (!editing.title.trim()) {
      toast.warn('任务标题不能为空')
      return
    }
    const payload = {
      title: editing.title.trim(),
      description: editing.description,
      doneWhen: editing.doneWhen,
      status: editing.status,
      priority: editing.priority,
      dueDate: editing.dueDate || null,
      estimatedHours: editing.estimatedHours === '' ? null : Number(editing.estimatedHours),
    }
    if (editing.isNew) {
      actions.createTask(project.id, payload)
      toast.success('任务已添加')
    } else {
      actions.updateTask(editing.id, payload)
      toast.success('任务已更新')
    }
    setEditing(null)
  }

  const addQuickSet = (set) => {
    set.tasks.forEach((title) => actions.createTask(project.id, { title, priority: 'medium' }))
    toast.success(`已添加 ${set.tasks.length} 个任务`)
  }

  // 任务侧以前完全没有 AI —— 「不知道这步该做什么」和「不知道要学什么」是一样的困境。
  const openPlan = async () => {
    if (!project.description?.trim()) {
      toast.warn('先写两句项目说明，拆出来的步骤才贴题。')
      return
    }

    setPlanBusy(true)
    const res = await planProject({
      projectName: project.name,
      category: project.category,
      description: project.description,
      constraints: project.constraints || [],
      dueDate: project.dueDate || null,
      // 已有的步骤传过去，让模型别重复拆
      existing: state.tasks
        .filter((t) => t.projectId === project.id)
        .map((t) => ({ title: t.title, description: t.description })),
    })
    setPlanBusy(false)

    if (!res.ok) {
      toast.error(res.message || '拆解失败，稍后再试。')
      return
    }
    if (res.notice) toast.info(res.notice)

    setPlanSource(res.source || null)
    setPlanModel(res.model || null)
    setPlanProposal(res.steps || [])
    setPlanOpen(true)
  }

  const applyPlan = (steps) => {
    if (steps.length === 0) return
    for (const s of steps) {
      actions.createTask(project.id, {
        title: s.title,
        description: s.description,
        doneWhen: s.doneWhen,
        priority: 'medium',
      })
    }
    toast.success(`已加进 ${steps.length} 个步骤`)
    setPlanOpen(false)
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.modeToggle} role="group" aria-label="进度模式">
          <button
            type="button"
            data-active={project.progressMode !== 'manual'}
            onClick={() => setMode('auto')}
          >
            自动计算
          </button>
          <button
            type="button"
            data-active={project.progressMode === 'manual'}
            onClick={() => setMode('manual')}
          >
            手动调整
          </button>
        </div>

        <div className={styles.progressSummary}>
          <span className={`${styles.pct} num`}>{detail.value}%</span>
          <span className={styles.pctSub}>
            {project.progressMode === 'manual'
              ? '手动模式'
              : detail.hasTasks
                ? `${detail.done}/${detail.total} 任务完成`
                : '还没有任务'}
          </span>
          {project.progressMode === 'manual' && (
            <input
              className={styles.slider}
              type="range"
              min="0"
              max="100"
              value={project.manualProgress ?? 0}
              aria-label="手动进度"
              onChange={(e) =>
                actions.updateProject(project.id, { manualProgress: Number(e.target.value) })
              }
            />
          )}
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.viewToggle} role="group" aria-label="视图切换">
            <button type="button" data-active={view === 'board'} onClick={() => setView('board')}>
              看板
            </button>
            <button type="button" data-active={view === 'list'} onClick={() => setView('list')}>
              列表
            </button>
          </div>
          <Button size="sm" variant="ghost" onClick={openPlan} disabled={planBusy}>
            {planBusy ? '拆解中…' : '让 AI 拆解项目'}
          </Button>
          <Button variant="primary" size="sm" icon="+" onClick={() => openNew()}>
            新建任务
          </Button>
        </div>
      </div>

      {done && project.status !== 'done' && (
        <div className={styles.doneBanner}>
          <span>
            {detail.total} 个任务全部完成，把这个项目标记为已完成？
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              actions.updateProject(project.id, { status: 'done' })
              toast.success('项目已标记为完成')
            }}
          >
            标记为已完成
          </Button>
        </div>
      )}

      {detail.total === 0 ? (
        <EmptyState
          icon="☰"
          title="还没有任务"
          description="任务决定进度条怎么走。可以一个一个加，也可以从下面的常用结构快速起个头。"
        >
          <Button variant="primary" onClick={() => openNew()}>
            添加第一个任务
          </Button>
          {QUICK_SETS.map((set) => (
            <Button key={set.label} variant="ghost" onClick={() => addQuickSet(set)}>
              {set.label}
            </Button>
          ))}
        </EmptyState>
      ) : view === 'board' ? (
        <div className={styles.board}>
          {columns.map((col) => (
            <section
              key={col.key}
              className={styles.column}
              data-over={overCol === col.key}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (overCol !== col.key) setOverCol(col.key)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(col.key, col.items.length)
              }}
            >
              <header className={styles.colHead}>
                <span className={styles.colDot} data-tone={col.tone} aria-hidden="true" />
                <span className={styles.colTitle}>{col.label}</span>
                <span className={`${styles.colCount} num`}>{col.items.length}</span>
                <button
                  type="button"
                  className={styles.colAdd}
                  aria-label={`在「${col.label}」新建任务`}
                  onClick={() => openNew(col.key)}
                >
                  +
                </button>
              </header>

              <div className={styles.colBody}>
                {col.items.map((task, index) => (
                  <article
                    key={task.id}
                    className={styles.taskCard}
                    draggable
                    data-dragging={dragId === task.id}
                    onDragStart={(e) => {
                      setDragId(task.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', task.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverCol(null)
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleDrop(col.key, index)
                    }}
                  >
                    <div className={styles.taskTop}>
                      <span className={styles.prioDot} data-priority={task.priority} />
                      <button
                        type="button"
                        className={styles.taskTitle}
                        onClick={() => openEdit(task)}
                      >
                        {task.title}
                      </button>
                      <Menu
                        ariaLabel={`${task.title} 的操作`}
                        items={[
                          { label: '编辑', onClick: () => openEdit(task) },
                          ...TASK_STATUS_ORDER.filter((s) => s !== task.status).map((s) => ({
                            label: `移到${TASK_STATUS[s].label}`,
                            onClick: () => actions.moveTask(task.id, s, 0),
                          })),
                          {
                            label: '删除',
                            tone: 'danger',
                            onClick: () => {
                              actions.deleteTask(task.id)
                              toast.success('任务已删除')
                            },
                          },
                        ]}
                      />
                    </div>

                    <div className={styles.taskMeta}>
                      <span data-priority={task.priority}>{PRIORITY[task.priority]?.label}</span>
                      {task.dueDate && (
                        <span data-level={getDeadlineInfo(task.dueDate).level}>
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                      {task.estimatedHours ? <span>{task.estimatedHours}h</span> : null}
                    </div>
                  </article>
                ))}

                {col.items.length === 0 && (
                  <button
                    type="button"
                    className={styles.colEmpty}
                    onClick={() => openNew(col.key)}
                  >
                    拖到这里，或点此新建
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.listWrap}>
          <table className={styles.list}>
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>优先级</th>
                <th>截止</th>
                <th>预计</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.tasks
                .filter((t) => t.projectId === project.id)
                .sort(
                  (a, b) =>
                    TASK_STATUS_ORDER.indexOf(a.status) - TASK_STATUS_ORDER.indexOf(b.status) ||
                    a.order - b.order,
                )
                .map((task) => (
                  <tr key={task.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.listTitle}
                        data-done={task.status === 'done'}
                        onClick={() => openEdit(task)}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td>
                      <Select
                        value={task.status}
                        aria-label={`${task.title} 的状态`}
                        onChange={(e) => actions.moveTask(task.id, e.target.value, 0)}
                      >
                        {TASK_STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS[s].label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td data-priority={task.priority}>{PRIORITY[task.priority]?.label}</td>
                    <td>{task.dueDate ? formatDate(task.dueDate) : '—'}</td>
                    <td>{task.estimatedHours ? `${task.estimatedHours}h` : '—'}</td>
                    <td className={styles.listActions}>
                      <Menu
                        ariaLabel={`${task.title} 的操作`}
                        items={[
                          { label: '编辑', onClick: () => openEdit(task) },
                          {
                            label: '删除',
                            tone: 'danger',
                            onClick: () => {
                              actions.deleteTask(task.id)
                              toast.success('任务已删除')
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <PlanStepsModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        proposal={planProposal}
        source={planSource}
        model={planModel}
        onApply={applyPlan}
      />

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? '新建任务' : '编辑任务'}
        width={520}
        footer={
          <>
            <div className={styles.spacer} />
            {!editing?.isNew && (
              <Button
                variant="dangerGhost"
                onClick={() => {
                  actions.deleteTask(editing.id)
                  toast.success('任务已删除')
                  setEditing(null)
                }}
              >
                删除
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={saveTask}>
              保存
            </Button>
          </>
        }
      >
        {editing && (
          <div className={styles.form}>
            <Field label="任务标题" required>
              <Input
                value={editing.title}
                autoFocus
                onChange={(e) => setEditing((t) => ({ ...t, title: e.target.value }))}
                placeholder="具体到能立刻动手"
              />
            </Field>

            <Field label="要做什么">
              <Textarea
                value={editing.description}
                rows={3}
                onChange={(e) => setEditing((t) => ({ ...t, description: e.target.value }))}
                placeholder="具体到能照着动手，比如：熟悉相机的基本操作，把光圈、快门、ISO 各拨一遍"
              />
            </Field>

            <Field
              label="算完成"
              hint="做到什么程度就能放下这一步了。写不出来通常说明这步还没想清楚。"
            >
              <Textarea
                value={editing.doneWhen}
                rows={2}
                onChange={(e) => setEditing((t) => ({ ...t, doneWhen: e.target.value }))}
                placeholder="比如：不看说明书也能调出想要的亮度"
              />
            </Field>

            <div className={styles.formRow}>
              <Field label="状态">
                <Select
                  value={editing.status}
                  onChange={(e) => setEditing((t) => ({ ...t, status: e.target.value }))}
                >
                  {TASK_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="优先级">
                <Select
                  value={editing.priority}
                  onChange={(e) => setEditing((t) => ({ ...t, priority: e.target.value }))}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className={styles.formRow}>
              <Field label="截止日期">
                <Input
                  type="date"
                  value={editing.dueDate}
                  onChange={(e) => setEditing((t) => ({ ...t, dueDate: e.target.value }))}
                />
              </Field>

              <Field label="预计耗时（小时）">
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editing.estimatedHours}
                  onChange={(e) => setEditing((t) => ({ ...t, estimatedHours: e.target.value }))}
                  placeholder="2"
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
