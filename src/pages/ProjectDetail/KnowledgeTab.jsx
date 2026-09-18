import { useMemo, useState } from 'react'
import { assignKnowledgeSteps } from '../../api/index.js'
import { AssignStepsModal } from '../../components/AssignStepsModal.jsx'
import { KnowledgeItemModal } from '../../components/KnowledgeItemModal.jsx'
import { SuggestionList, SuggestionSkeleton } from '../../components/SuggestionList.jsx'
import { useToast } from '../../components/Toast.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Menu } from '../../components/ui/Menu.jsx'
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx'
import { KNOWLEDGE_STATUS, KNOWLEDGE_STATUS_ORDER } from '../../data/options.js'
import { KNOWLEDGE_TEMPLATES } from '../../data/knowledgeTemplates.js'
import { isBlockingRelation, resolveProjectKnowledge } from '../../domain/knowledge.js'
import { projectTasks, stepMarker } from '../../domain/roadmap.js'
import { useKnowledgeSuggestion } from '../../hooks/useKnowledgeSuggestion.js'
import { useApp } from '../../store/AppContext.jsx'
import styles from './KnowledgeTab.module.css'

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'notStarted', label: '未开始' },
  { key: 'learning', label: '学习中' },
  { key: 'mastered', label: '已掌握' },
  { key: 'blocking', label: '仅阻塞' },
  { key: 'unassigned', label: '未安排' },
]

export function KnowledgeTab({ project }) {
  const { state, actions } = useApp()
  const toast = useToast()

  const [filter, setFilter] = useState('all')
  const [modalItem, setModalItem] = useState(null) // null | { relation } | { isNew: true }
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignSource, setAssignSource] = useState(null)
  const [assignModel, setAssignModel] = useState(null)
  const [proposal, setProposal] = useState([])

  const {
    suggestions,
    setSuggestions,
    suggesting,
    suggest,
    reset,
    selected,
    matches,
    source,
    model: suggestModel,
  } = useKnowledgeSuggestion()

  const items = useMemo(
    () =>
      resolveProjectKnowledge(project.id, state.projectKnowledge, state.knowledgeConcepts).sort(
        (a, b) => {
          const ab = isBlockingRelation(a) ? 0 : 1
          const bb = isBlockingRelation(b) ? 0 : 1
          if (ab !== bb) return ab - bb
          return KNOWLEDGE_STATUS_ORDER.indexOf(a.status) - KNOWLEDGE_STATUS_ORDER.indexOf(b.status)
        },
      ),
    [project.id, state.projectKnowledge, state.knowledgeConcepts],
  )

  // 路线上的步骤，用来给知识点选「服务哪一步」。编号和「执行路线」页一致。
  const steps = useMemo(
    () => projectTasks(project.id, state.tasks),
    [project.id, state.tasks],
  )
  const stepIds = useMemo(() => new Set(steps.map((t) => t.id)), [steps])

  // 指向了已删除步骤的也算未安排 —— 否则它会在两处都看不见
  const isAssigned = (item) => Boolean(item.stepTaskId) && stepIds.has(item.stepTaskId)

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'blocking') return items.filter(isBlockingRelation)
    if (filter === 'unassigned') return items.filter((k) => !isAssigned(k))
    return items.filter((k) => k.status === filter)
  }, [items, filter, stepIds])

  const counts = useMemo(() => {
    const map = {
      all: items.length,
      blocking: items.filter(isBlockingRelation).length,
      unassigned: items.filter((k) => !isAssigned(k)).length,
    }
    for (const s of KNOWLEDGE_STATUS_ORDER) {
      map[s] = items.filter((k) => k.status === s).length
    }
    return map
  }, [items, stepIds])

  const openAdd = () => {
    reset()
    setModalItem({ isNew: true })
  }

  const openSuggest = () => {
    reset()
    setSuggestOpen(true)
    // 带上已经拆好的步骤（含每步「要做什么」）—— AI 才能贴着每一步的具体动作
    // 生成知识点，而不是按项目主题泛泛地给「数据可视化」这种大词
    suggest({
      projectName: project.name,
      category: project.category,
      description: project.description,
      tasks: steps.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        doneWhen: t.doneWhen || '',
      })),
    })
  }

  // 对已有的知识点重排一次。生成流程只帮得到新知识点，这条是给老数据、
  // 以及「任务改了要重排」用的。
  const openAssign = async () => {
    if (steps.length === 0) {
      toast.warn('这个项目还没拆出步骤。先去「任务与进度」加几条，AI 才有地方可排。')
      return
    }
    if (items.length === 0) {
      toast.warn('这里还没有知识点可以安排。')
      return
    }

    setAssignBusy(true)
    const res = await assignKnowledgeSteps({
      projectName: project.name,
      description: project.description,
      tasks: steps.map((t) => ({ id: t.id, title: t.title })),
      knowledge: items.map((k) => ({
        conceptId: k.conceptId,
        name: k.concept.name,
        reasonNeeded: k.reasonNeeded,
      })),
    })
    setAssignBusy(false)

    if (!res.ok) {
      toast.error(res.message || '安排失败，稍后再试。')
      return
    }
    if (res.notice) toast.info(res.notice)

    const nameById = new Map(items.map((k) => [k.conceptId, k.concept.name]))
    setAssignSource(res.source || null)
    setAssignModel(res.model || null)
    setProposal(
      (res.assignments || []).map((a) => ({ ...a, name: nameById.get(a.conceptId) || a.conceptId })),
    )
    setAssignOpen(true)
  }

  const applyAssign = (rows) => {
    const relByConcept = new Map(items.map((k) => [k.conceptId, k.id]))
    let n = 0
    for (const row of rows) {
      const relId = relByConcept.get(row.conceptId)
      if (!relId) continue
      actions.setKnowledgeStep(relId, row.stepId || null)
      n += 1
    }
    toast.success(`按建议安排了 ${n} 条知识点`)
    setAssignOpen(false)
  }

  const applySuggestions = () => {
    if (selected.length === 0) {
      toast.warn('一条都没勾选')
      return
    }
    const result = actions.addKnowledgeItems(project.id, selected)
    toast.success(
      `加入 ${result.added} 条${result.reused > 0 ? `，其中 ${result.reused} 条复用了已有概念` : ''}`,
    )
    setSuggestOpen(false)
    reset()
  }

  const applyTemplate = (template) => {
    const result = actions.addKnowledgeItems(project.id, template.items)
    toast.success(`已从「${template.name}」加入 ${result.added} 条`)
    setTemplateOpen(false)
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" icon="+" onClick={openAdd}>
          添加知识点
        </Button>
        <Button size="sm" icon="✨" onClick={openSuggest}>
          AI 生成建议
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTemplateOpen(true)}>
          从模板库选择
        </Button>
        {items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={openAssign} disabled={assignBusy}>
            {assignBusy ? '安排中…' : '让 AI 排到各步'}
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className={styles.filters} role="group" aria-label="知识点筛选">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-active={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className={styles.filterCount}>{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="◈"
          title="还没有知识点清单"
          description="列出做这个项目需要补的基础知识，能帮你判断该先学什么、哪些在挡路。"
        >
          <Button variant="primary" icon="✨" onClick={openSuggest}>
            用 AI 根据项目描述生成
          </Button>
          <Button variant="ghost" onClick={openAdd}>
            手动添加
          </Button>
          <Button variant="ghost" onClick={() => setTemplateOpen(true)}>
            从模板库选择
          </Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon="🔍"
          title="这个筛选下没有知识点"
          description="换个状态看看，或者点「全部」。"
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((item) => {
            const blocking = isBlockingRelation(item)
            const status = KNOWLEDGE_STATUS[item.status] || KNOWLEDGE_STATUS.notStarted
            const resources = [
              ...(item.concept.defaultResources || []),
              ...(item.resourceLinks || []),
            ]

            return (
              <li key={item.id} className={styles.item} data-blocking={blocking}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{item.concept.name}</span>
                    <span className={styles.itemCat}>{item.concept.category}</span>
                    {blocking && <span className={styles.blockTag}>阻塞项目</span>}
                  </div>

                  {item.reasonNeeded && (
                    <p className={styles.reason}>
                      <span className={styles.reasonLabel}>为什么需要</span>
                      {item.reasonNeeded}
                    </p>
                  )}

                  {resources.length > 0 && (
                    <p className={styles.resources}>
                      <span aria-hidden="true">📚</span>
                      {resources.map((r, i) => (
                        <span key={r.url}>
                          {i > 0 && ' · '}
                          <a href={r.url} target="_blank" rel="noreferrer noopener">
                            {r.label}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}

                  <p className={styles.meta}>
                    {item.estimatedMinutes ? `预计 ${item.estimatedMinutes} 分钟` : '未估时长'}
                    {item.notes && <span className={styles.notes}> · {item.notes}</span>}
                  </p>
                </div>

                <div className={styles.itemSide}>
                  <select
                    className={styles.statusSelect}
                    data-status={item.status}
                    value={item.status}
                    aria-label={`${item.concept.name} 的掌握状态`}
                    onChange={(e) =>
                      actions.updateRelation(item.id, { status: e.target.value })
                    }
                  >
                    {KNOWLEDGE_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {KNOWLEDGE_STATUS[s].label}
                      </option>
                    ))}
                  </select>

                  <select
                    className={styles.stepSelect}
                    data-assigned={isAssigned(item)}
                    value={isAssigned(item) ? item.stepTaskId : ''}
                    aria-label={`${item.concept.name} 服务哪一步`}
                    onChange={(e) => actions.setKnowledgeStep(item.id, e.target.value || null)}
                  >
                    <option value="">未安排</option>
                    {steps.map((t, i) => (
                      <option key={t.id} value={t.id}>
                        {stepMarker(i)} {t.title}
                      </option>
                    ))}
                  </select>

                  <Menu
                    ariaLabel={`${item.concept.name} 的操作`}
                    items={[
                      { label: '编辑', onClick: () => setModalItem({ relation: item }) },
                      {
                        label: blocking ? '取消阻塞标记' : '标记为阻塞',
                        onClick: () =>
                          actions.updateRelation(item.id, { blocksProject: !blocking }),
                      },
                      {
                        label: '从项目移除',
                        tone: 'danger',
                        onClick: () => setRemoving(item),
                      },
                    ]}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <KnowledgeItemModal
        open={Boolean(modalItem)}
        onClose={() => setModalItem(null)}
        projectId={project.id}
        relation={modalItem?.relation || null}
      />

      <Modal
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        title="AI 生成知识点建议"
        description="根据项目名称和描述推荐，结果可以逐条勾选，不会直接写进去。"
        width={620}
        footer={
          <>
            <div className={styles.spacer} />
            <Button variant="ghost" onClick={() => setSuggestOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={suggesting || selected.length === 0}
              onClick={applySuggestions}
            >
              添加选中的 {selected.length} 条
            </Button>
          </>
        }
      >
        {!project.description?.trim() && (
          <p className={styles.warnLine}>
            这个项目还没写描述，生成结果可能不够贴题。可以先回概览页补两句。
          </p>
        )}
        {suggesting ? (
          <SuggestionSkeleton />
        ) : (
          <SuggestionList
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            matches={matches}
            source={source}
            model={suggestModel}
            steps={steps}
          />
        )}
      </Modal>

      <AssignStepsModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        proposal={proposal}
        steps={steps}
        source={assignSource}
        model={assignModel}
        onApply={applyAssign}
      />

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="从模板库选择"
        description="内置的常用知识包。同名的知识点会直接关联到已有概念，不重复创建。"
        width={580}
      >
        <ul className={styles.templates}>
          {KNOWLEDGE_TEMPLATES.map((t) => (
            <li key={t.id}>
              <div className={styles.templateHead}>
                <strong>{t.name}</strong>
                <Button size="sm" onClick={() => applyTemplate(t)}>
                  加入本项目
                </Button>
              </div>
              <p className={styles.templateDesc}>{t.description}</p>
              <ul className={styles.templateItems}>
                {t.items.map((i) => (
                  <li key={i.name}>
                    {i.name}
                    <span className={styles.templateCat}>{i.category}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          actions.unlinkKnowledge(removing.id)
          toast.success('已从本项目移除，知识点仍保留在知识库')
        }}
        title="从项目移除知识点"
        message={removing?.concept?.name}
        confirmLabel="移除"
        tone="danger"
      >
        <p className={styles.removeNote}>
          只会解除它和本项目的关联，知识点本身会保留在知识库里，其他项目不受影响。
        </p>
      </ConfirmDialog>
    </>
  )
}
