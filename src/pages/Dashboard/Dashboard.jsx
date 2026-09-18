import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AgentLauncherRow } from '../../components/AgentLauncher.jsx'
import { ProjectCard } from '../../components/ProjectCard.jsx'
import { ProjectFormModal } from '../../components/ProjectFormModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { PRIORITY, PRIORITY_ORDER } from '../../data/options.js'
import { agentOptionsFrom } from '../../domain/agents.js'
import { blockingOverview, totalBlockingCount } from '../../domain/blocking.js'
import { currentWeekRange, greeting, toDateString, todayString, weekdayLabel } from '../../domain/dates.js'
import { getDeadlineInfo } from '../../domain/deadline.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './Dashboard.module.css'

export function Dashboard() {
  const { state, actions, ai } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)

  // 没接 AI 时的常驻入口。横幅关掉之后总得留个地方能找回来 ——
  // 但横幅还在的时候不重复出现。
  const showAiEntry =
    ai.status?.ok && !ai.status.configured && ai.bannerDismissed

  const { projects, tasks, projectKnowledge, knowledgeConcepts } = state

  const pinnedAgents = useMemo(
    () => agentOptionsFrom(state).filter((a) => a.isPinned),
    [state],
  )

  const stats = useMemo(() => {
    const active = projects.filter((p) => !p.archived)
    const activeIds = new Set(active.map((p) => p.id))

    const activeProjects = active.filter((p) => p.status === 'active').length

    const dueSoon = active.filter((p) => {
      if (p.status === 'done') return false
      const info = getDeadlineInfo(p.dueDate)
      return info.level === 'overdue' || info.level === 'urgent'
    }).length

    const { start, end } = currentWeekRange()
    const weekDone = tasks.filter((t) => {
      if (!t.completedAt) return false
      const day = toDateString(new Date(t.completedAt))
      return day >= start && day <= end
    }).length

    const pendingKnowledge = projectKnowledge.filter(
      (k) => activeIds.has(k.projectId) && k.status !== 'mastered',
    ).length

    return { activeProjects, dueSoon, weekDone, pendingKnowledge }
  }, [projects, tasks, projectKnowledge])

  const recent = useMemo(
    () =>
      projects
        .filter((p) => !p.archived)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 3),
    [projects],
  )

  const projectNames = useMemo(() => {
    const map = {}
    for (const p of projects) map[p.id] = p.name
    return map
  }, [projects])

  const todos = useMemo(() => {
    const activeIds = new Set(projects.filter((p) => !p.archived).map((p) => p.id))
    return tasks
      .filter((t) => t.status !== 'done' && activeIds.has(t.projectId))
      .sort((a, b) => {
        const ad = a.dueDate || '9999-12-31'
        const bd = b.dueDate || '9999-12-31'
        if (ad !== bd) return ad < bd ? -1 : 1
        return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      })
      .slice(0, 6)
  }, [tasks, projects])

  const study = useMemo(() => {
    const learning = projectKnowledge.filter((k) => k.status === 'learning')
    const minutes = learning.reduce((sum, k) => sum + (k.estimatedMinutes || 0), 0)
    const blocked = projectKnowledge.filter(
      (k) => k.status !== 'mastered' && k.blocksProject,
    ).length
    return { count: learning.length, hours: Math.round((minutes / 60) * 10) / 10, blocked }
  }, [projectKnowledge])

  const blocking = useMemo(
    () => blockingOverview(projects, projectKnowledge, knowledgeConcepts),
    [projects, projectKnowledge, knowledgeConcepts],
  )

  const blockingTotal = useMemo(
    () => totalBlockingCount(projects, projectKnowledge),
    [projects, projectKnowledge],
  )

  const today = new Date()

  const handleImportSeed = () => {
    const summary = actions.loadSeed()
    toast.success(`已导入示例数据：${summary.projects} 个项目、${summary.tasks} 个任务`)
  }

  if (projects.length === 0) {
    return (
      <>
        <header className={styles.greeting}>
          <div>
            <h1 className={styles.hello}>{greeting(today)}</h1>
            <p className={styles.date}>
              今天 {todayString()} {weekdayLabel(today)}
            </p>
          </div>
        </header>

        <EmptyState
          icon="◫"
          title="创建你的第一个项目"
          description="建好之后，这里会显示项目进度、今天该做什么，以及哪些知识点卡住了你。"
        >
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            新建项目
          </Button>
          <Button variant="ghost" onClick={handleImportSeed}>
            或导入示例项目体验一下
          </Button>
          {showAiEntry && (
            <Button variant="ghost" onClick={() => navigate('/settings')}>
              接入 AI
            </Button>
          )}
        </EmptyState>

        <ProjectFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={(id) => navigate(`/projects/${id}`)}
        />
      </>
    )
  }

  return (
    <>
      <header className={styles.greeting}>
        <div>
          <h1 className={styles.hello}>{greeting(today)}</h1>
          <p className={styles.date}>
            今天 {todayString()} {weekdayLabel(today)}
          </p>
        </div>
        <Button variant="primary" icon="+" onClick={() => setFormOpen(true)}>
          新建项目
        </Button>
      </header>

      {pinnedAgents.length > 0 ? (
        <AgentLauncherRow agents={pinnedAgents} onNeedConfig={() => navigate('/agents')} />
      ) : (
        <section className={styles.agentEmpty}>
          <span>还没有固定在首页的 Agent。</span>
          <Link to="/agents">去添加 →</Link>
        </section>
      )}

      <section className={styles.stats} aria-label="总览">
        <StatCard label="进行中" value={stats.activeProjects} unit="个项目" />
        <StatCard
          label="即将截止"
          value={stats.dueSoon}
          unit="3 天内"
          tone={stats.dueSoon > 0 ? 'red' : 'gray'}
        />
        <StatCard label="本周完成" value={stats.weekDone} unit="个任务" tone="green" />
        <StatCard label="待学习" value={stats.pendingKnowledge} unit="个知识点" />
      </section>

      {blockingTotal > 0 && (
        <section className={styles.blockAlert} aria-label="知识点阻塞提醒">
          <span className={styles.blockIcon} aria-hidden="true">
            ⚠️
          </span>
          <div className={styles.blockBody}>
            <strong>{blockingTotal} 个知识点阻塞着项目</strong>
            <ul className={styles.blockList}>
              {blocking.map(({ project, items }) => (
                <li key={project.id}>
                  <Link to={`/projects/${project.id}?tab=knowledge`}>
                    {project.name}
                  </Link>
                  <span className={styles.blockNames}>
                    {items.map((i) => i.concept.name).join('、')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <section className={styles.colMain} aria-labelledby="recent-title">
          <div className={styles.colHead}>
            <h2 id="recent-title">最近项目</h2>
            <Link to="/projects">全部 →</Link>
          </div>
          <div className={styles.recentList}>
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} showNextAction />
            ))}
          </div>
        </section>

        <div className={styles.colSide}>
          <section className={styles.panel} aria-labelledby="todo-title">
            <div className={styles.colHead}>
              <h2 id="todo-title">今日待办</h2>
            </div>
            {todos.length === 0 ? (
              <p className={styles.panelEmpty}>
                今天没有待办，去项目里添加任务吧。
              </p>
            ) : (
              <ul className={styles.todoList}>
                {todos.map((t) => {
                  const info = getDeadlineInfo(t.dueDate)
                  return (
                    <li key={t.id} className={styles.todoItem}>
                      <span className={styles.todoCheck} aria-hidden="true" />
                      <div className={styles.todoBody}>
                        <span className={styles.todoTitle}>{t.title}</span>
                        <span className={styles.todoMeta}>
                          {projectNames[t.projectId]}
                          {t.dueDate && (
                            <>
                              {' · '}
                              <span data-level={info.level}>{info.label}</span>
                            </>
                          )}
                          {' · '}
                          <span data-priority={t.priority}>
                            {PRIORITY[t.priority]?.label}
                          </span>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="study-title">
            <div className={styles.colHead}>
              <h2 id="study-title">学习提醒</h2>
            </div>
            {study.count === 0 ? (
              <p className={styles.panelEmpty}>
                暂时没有正在学习的知识点。
                {study.blocked > 0 && ` 但有 ${study.blocked} 个在阻塞项目。`}
              </p>
            ) : (
              <div className={styles.studyBody}>
                <p>
                  📖 正在学习 <strong className="num">{study.count}</strong> 个知识点
                </p>
                {study.hours > 0 && (
                  <p className={styles.studySub}>
                    预计还需 <strong className="num">{study.hours}</strong> 小时
                  </p>
                )}
                {study.blocked > 0 && (
                  <p className={styles.studyWarn}>
                    其中 {study.blocked} 个正在阻塞项目
                  </p>
                )}
                <Link to="/knowledge" className={styles.studyLink}>
                  去知识库 →
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>

      <ProjectFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => navigate(`/projects/${id}`)}
      />
    </>
  )
}

function StatCard({ label, value, unit, tone = 'gray' }) {
  return (
    <div className={styles.stat} data-tone={tone}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} num`}>{value}</span>
      <span className={styles.statUnit}>{unit}</span>
    </div>
  )
}
