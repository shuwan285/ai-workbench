import { useEffect, useMemo, useState } from 'react'
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_STATUS, KNOWLEDGE_STATUS_ORDER } from '../data/options.js'
import { findConceptByName, normalizeName, searchConcepts } from '../domain/knowledge.js'
import { useApp } from '../store/AppContext.jsx'
import { useToast } from './Toast.jsx'
import { Button } from './ui/Button.jsx'
import { Checkbox, Field, Input, Select, Textarea } from './ui/Field.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './KnowledgeItemModal.module.css'

const emptyDetail = {
  reasonNeeded: '',
  status: 'notStarted',
  estimatedMinutes: '',
  blocksProject: false,
  notes: '',
}

export function KnowledgeItemModal({ open, onClose, projectId, relation = null }) {
  const { state, actions } = useApp()
  const toast = useToast()

  const isEdit = Boolean(relation)

  const [name, setName] = useState('')
  const [chosen, setChosen] = useState(null) // { conceptId } 或 { isNew: true }
  const [newCategory, setNewCategory] = useState('其他')
  const [detail, setDetail] = useState(emptyDetail)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (relation) {
      const concept = state.knowledgeConcepts.find((c) => c.id === relation.conceptId)
      setName(concept?.name || '')
      setChosen({ conceptId: relation.conceptId })
      setDetail({
        reasonNeeded: relation.reasonNeeded || '',
        status: relation.status || 'notStarted',
        estimatedMinutes: relation.estimatedMinutes ?? '',
        blocksProject: Boolean(relation.blocksProject),
        notes: relation.notes || '',
      })
    } else {
      setName('')
      setChosen(null)
      setNewCategory('其他')
      setDetail(emptyDetail)
    }
  }, [open, relation, state.knowledgeConcepts])

  const matches = useMemo(
    () => (chosen || !name.trim() ? [] : searchConcepts(name, state.knowledgeConcepts, 6)),
    [name, state.knowledgeConcepts, chosen],
  )

  const exact = useMemo(
    () => findConceptByName(name, state.knowledgeConcepts),
    [name, state.knowledgeConcepts],
  )

  const chosenConcept = chosen?.conceptId
    ? state.knowledgeConcepts.find((c) => c.id === chosen.conceptId)
    : null

  const handleSave = () => {
    const finalName = name.trim()
    if (!finalName) {
      setError('知识点名称不能为空')
      return
    }

    const payload = {
      reasonNeeded: detail.reasonNeeded,
      status: detail.status,
      estimatedMinutes:
        detail.estimatedMinutes === '' ? null : Number(detail.estimatedMinutes),
      blocksProject: detail.blocksProject,
      notes: detail.notes,
    }

    if (isEdit) {
      actions.updateRelation(relation.id, payload)
      toast.success('知识点已更新')
      onClose?.()
      return
    }

    if (chosen?.isNew) {
      const concept = actions.createConcept({
        name: finalName,
        category: newCategory,
        defaultResources: [],
      })
      actions.linkConcept(projectId, concept.id, payload)
      toast.success(`已新建知识点并加入项目：${finalName}`)
    } else if (chosen?.conceptId) {
      const res = actions.linkConcept(projectId, chosen.conceptId, payload)
      if (!res.ok && res.reason === 'ALREADY_LINKED') {
        toast.warn('这个知识点已经在本项目里了')
        return
      }
      toast.success('已关联到已有知识点')
    } else {
      // 没手动选，按名称判断是复用还是新建
      if (exact) {
        actions.linkConcept(projectId, exact.id, payload)
        toast.success(`已关联到已有知识点「${exact.name}」`)
      } else {
        const concept = actions.createConcept({
          name: finalName,
          category: newCategory,
          defaultResources: [],
        })
        actions.linkConcept(projectId, concept.id, payload)
        toast.success('已新建知识点')
      }
    }
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑知识点' : '添加知识点'}
      description={
        isEdit
          ? '这里改的是这个项目里的状态，通用信息在知识库页维护。'
          : '先看知识库里有没有同名的，有就直接关联，避免重复。'
      }
      width={560}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {isEdit ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="知识点名称" required error={error}>
          <Input
            value={name}
            autoFocus={!isEdit}
            disabled={isEdit}
            onChange={(e) => {
              setName(e.target.value)
              setChosen(null)
              if (error) setError('')
            }}
            placeholder="例如：理解曝光三要素"
          />
        </Field>

        {!isEdit && chosen && (
          <div className={styles.chosen}>
            {chosen.isNew ? (
              <>
                <span className={styles.chosenTag} data-kind="new">
                  新建概念
                </span>
                <span>知识库里还没有「{name.trim()}」，会新建一条。</span>
                <button type="button" onClick={() => setChosen(null)}>
                  改选
                </button>
              </>
            ) : (
              <>
                <span className={styles.chosenTag} data-kind="reuse">
                  关联已有
                </span>
                <span>{chosenConcept?.name}</span>
                <button type="button" onClick={() => setChosen(null)}>
                  改选
                </button>
              </>
            )}
          </div>
        )}

        {!isEdit && !chosen && name.trim() && (
          <div className={styles.matches}>
            {matches.length > 0 && (
              <>
                <div className={styles.matchesHead}>知识库里已有这些，是从中选一个吗？</div>
                <ul>
                  {matches.map((c) => {
                    const usedBy = state.projectKnowledge.filter((k) => k.conceptId === c.id).length
                    return (
                      <li key={c.id}>
                        <span className={styles.matchName}>{c.name}</span>
                        <span className={styles.matchMeta}>
                          {c.category}
                          {usedBy > 0 ? ` · 被 ${usedBy} 个项目使用` : ''}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setName(c.name)
                            setChosen({ conceptId: c.id })
                          }}
                        >
                          关联
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setChosen({ isNew: true })}
            >
              + 创建新知识点「{name.trim()}」
            </Button>
          </div>
        )}

        {!isEdit && chosen?.isNew && (
          <Field label="分类" hint="决定它出现在知识库的哪一组">
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="为什么这个项目需要它"
          hint="写清楚卡在哪，之后回头看才知道当时为什么加这条。"
        >
          <Textarea
            value={detail.reasonNeeded}
            rows={2}
            onChange={(e) => setDetail((d) => ({ ...d, reasonNeeded: e.target.value }))}
            placeholder="例如：画面总是偏暗，多半是没搞懂曝光三要素怎么互相牵制"
          />
        </Field>

        <div className={styles.row}>
          <Field label="掌握状态">
            <Select
              value={detail.status}
              onChange={(e) => setDetail((d) => ({ ...d, status: e.target.value }))}
            >
              {KNOWLEDGE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {KNOWLEDGE_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="预计学习时长（分钟）">
            <Input
              type="number"
              min="0"
              step="5"
              value={detail.estimatedMinutes}
              onChange={(e) => setDetail((d) => ({ ...d, estimatedMinutes: e.target.value }))}
              placeholder="60"
            />
          </Field>
        </div>

        <Checkbox
          label="这个知识点没掌握会阻塞当前任务"
          checked={detail.blocksProject}
          onChange={(e) => setDetail((d) => ({ ...d, blocksProject: e.target.checked }))}
        />

        <Field label="备注">
          <Textarea
            value={detail.notes}
            rows={2}
            onChange={(e) => setDetail((d) => ({ ...d, notes: e.target.value }))}
            placeholder="看到哪了、哪个视频讲得清楚"
          />
        </Field>

        {chosenConcept?.defaultResources?.length > 0 && (
          <div className={styles.resources}>
            <div className={styles.resourcesHead}>这个概念自带的通用资源</div>
            <ul>
              {chosenConcept.defaultResources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer noopener">
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
