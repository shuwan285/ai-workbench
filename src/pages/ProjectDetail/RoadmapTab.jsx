import { useMemo, useState } from 'react'
import { reviewPlan } from '../../api/index.js'
import { ReviewPlanModal } from '../../components/ReviewPlanModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { KNOWLEDGE_STATUS, TASK_STATUS } from '../../data/options.js'
import { formatDate } from '../../domain/dates.js'
import { buildRoadmap, roadmapSummary, stepMarker, unassignedKnowledge } from '../../domain/roadmap.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './RoadmapTab.module.css'

export function RoadmapTab({ project }) {
  const { state, actions } = useApp()
  const toast = useToast()

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewSource, setReviewSource] = useState(null)
  const [reviewModel, setReviewModel] = useState(null)
  const [reviewVerdict, setReviewVerdict] = useState('')
  const [reviewGaps, setReviewGaps] = useState([])

  const steps = useMemo(
    () =>
      buildRoadmap(project.id, state.tasks, state.projectKnowledge, state.knowledgeConcepts),
    [project.id, state.tasks, state.projectKnowledge, state.knowledgeConcepts],
  )
  const loose = useMemo(
    () =>
      unassignedKnowledge(project.id, state.tasks, state.projectKnowledge, state.knowledgeConcepts),
    [project.id, state.tasks, state.projectKnowledge, state.knowledgeConcepts],
  )
  const summary = useMemo(() => roadmapSummary(steps, loose), [steps, loose])

  const stepIdByTitle = useMemo(() => {
    const map = new Map()
    for (const s of steps) map.set(s.task.title.trim(), s.task.id)
    return map
  }, [steps])

  // 应用自己保证不了「照这条路能做完」—— 只能让模型对着项目说明复核一遍。
  const runReview = async () => {
    if (steps.length === 0) {
      toast.warn('还没有步骤可以检查。先拆出几步，或者点「让 AI 拆解项目」。')
      return
    }

    setReviewBusy(true)
    const res = await reviewPlan({
      projectName: project.name,
      description: project.description,
      dueDate: project.dueDate || null,
      tasks: steps.map((s) => ({
        title: s.task.title,
        description: s.task.description || '',
        doneWhen: s.task.doneWhen || '',
      })),
      knowledge: [
        ...steps.flatMap((s) =>
          s.knowledge.map((k) => ({ name: k.concept.name, stepTitle: s.task.title })),
        ),
        ...loose.map((k) => ({ name: k.concept.name, stepTitle: '' })),
      ],
    })
    setReviewBusy(false)

    if (!res.ok) {
      toast.error(res.message || '检查失败，稍后再试。')
      return
    }
    if (res.notice) toast.info(res.notice)

    setReviewSource(res.source || null)
    setReviewModel(res.model || null)
    setReviewVerdict(res.verdict || '')
    setReviewGaps(res.gaps || [])
    setReviewOpen(true)
  }

  const addGapStep = (gap) => {
    actions.createTask(project.id, { title: gap.about, description: gap.detail, priority: 'medium' })
    toast.success(`已加上「${gap.about}」`)
  }

  const addGapKnowledge = (gap) => {
    const stepId = stepIdByTitle.get(String(gap.about).trim()) || null
    const res = actions.addKnowledgeItems(project.id, [
      {
        name: gap.knowledgeName,
        category: '其他',
        reasonNeeded: gap.detail,
        stepId,
      },
    ])
    if (res.added === 0) toast.info(`「${gap.knowledgeName}」已经在项目里了`)
    else toast.success(`已加上「${gap.knowledgeName}」`)
  }

  if (steps.length === 0) {
    return (
      <EmptyState
        icon="🗺"
        title="还没有任务，路线是空的"
        description="执行路线是「按顺序做哪几步、每一步要先补什么知识」的视图。先去「任务」页加几条，这里就会连起来。"
      />
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <span className={styles.stat}>
          <strong>{summary.total}</strong> 步
        </span>
        <span className={styles.stat}>
          已完成 <strong>{summary.done}</strong>
        </span>
        {summary.blocking > 0 && (
          <span className={`${styles.stat} ${styles.alert}`}>
            有 <strong>{summary.blocking}</strong> 步卡在知识点上
          </span>
        )}
        {summary.mismatches > 0 && (
          <span className={`${styles.stat} ${styles.alert}`}>
            <strong>{summary.mismatches}</strong> 步和知识点对不上
          </span>
        )}
        {summary.empty > 0 && (
          <span className={styles.stat}>
            还有 <strong>{summary.empty}</strong> 步没安排知识点
          </span>
        )}
        {summary.unassigned > 0 && (
          <span className={`${styles.stat} ${styles.alert}`}>
            有 <strong>{summary.unassigned}</strong> 个知识点还没安排到哪一步
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={styles.reviewBtn}
          onClick={runReview}
          disabled={reviewBusy}
        >
          {reviewBusy ? '检查中…' : '检查能不能做完'}
        </Button>
      </div>

      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const taskStatus = TASK_STATUS[step.task.status] || TASK_STATUS.todo
          const isCurrent = summary.current?.task.id === step.task.id

          return (
            <li
              key={step.task.id}
              className={styles.step}
              data-status={step.task.status}
              data-current={isCurrent}
            >
              <div className={styles.marker} aria-hidden="true">
                {stepMarker(index)}
              </div>

              <div className={styles.body}>
                <div className={styles.head}>
                  <span className={styles.title}>{step.task.title}</span>
                  <Badge tone={taskStatus.tone}>{taskStatus.label}</Badge>
                  {isCurrent && <span className={styles.here}>你在这</span>}
                  {step.hasMismatch && (
                    <Badge tone="amber">⚠ 知识点没跟上</Badge>
                  )}
                </div>

                <div className={styles.meta}>
                  {step.task.dueDate && <span>截止 {formatDate(step.task.dueDate)}</span>}
                  {step.task.estimatedHours != null && (
                    <span>预计 {step.task.estimatedHours} 小时</span>
                  )}
                </div>

                {/* 这一步要做什么。没写就直说 —— 做到这里才发现不知道从哪下手，
                    比现在被提醒一句糟糕得多。 */}
                {step.task.description ? (
                  <p className={styles.doThis}>{step.task.description}</p>
                ) : (
                  <p className={styles.missing}>这一步还没写「要做什么」，编辑补上再往下走。</p>
                )}

                {step.task.doneWhen && (
                  <p className={styles.doneWhen}>
                    <span className={styles.doneLabel}>算完成</span>
                    {step.task.doneWhen}
                  </p>
                )}

                {step.knowledge.length > 0 ? (
                  <ul className={styles.knowledge}>
                    {step.knowledge.map((k) => {
                      const meta = KNOWLEDGE_STATUS[k.status] || KNOWLEDGE_STATUS.notStarted
                      return (
                        <li key={k.conceptId} className={styles.kItem} data-blocking={k.isBlocking}>
                          <div className={styles.kHead}>
                            <span className={styles.kName}>{k.concept.name}</span>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {k.isBlocking && <span className={styles.mustFirst}>先补这个</span>}
                            {k.estimatedMinutes != null && (
                              <span className={styles.kMinutes}>{k.estimatedMinutes} 分钟</span>
                            )}
                          </div>
                          {k.reasonNeeded && <p className={styles.kReason}>{k.reasonNeeded}</p>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className={styles.noKnowledge}>
                    这一步还没安排知识点。去「知识点清单」，把要补的选成这一步。
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <ReviewPlanModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        verdict={reviewVerdict}
        gaps={reviewGaps}
        source={reviewSource}
        model={reviewModel}
        onAddStep={addGapStep}
        onAddKnowledge={addGapKnowledge}
      />
    </div>
  )
}
