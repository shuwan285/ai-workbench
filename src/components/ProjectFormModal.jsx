import { useEffect, useState } from 'react'
import {
  COVER_COLORS,
  PRIORITY,
  PRIORITY_ORDER,
  PROJECT_STATUS,
  PROJECT_STATUS_ORDER,
} from '../data/options.js'
import { normalizeConstraints } from '../domain/constraints.js'
import { todayString } from '../domain/dates.js'
import { useKnowledgeSuggestion } from '../hooks/useKnowledgeSuggestion.js'
import { useApp } from '../store/AppContext.jsx'
import { SuggestionList, SuggestionSkeleton } from './SuggestionList.jsx'
import { useToast } from './Toast.jsx'
import { Button } from './ui/Button.jsx'
import { Field, Input, Select, Textarea } from './ui/Field.jsx'
import { Modal } from './ui/Modal.jsx'
import styles from './ProjectFormModal.module.css'

function initialState(project, categories) {
  return {
    name: project?.name || '',
    category: project?.category || categories[0] || '其他',
    description: project?.description || '',
    status: project?.status || 'idea',
    priority: project?.priority || 'medium',
    coverColor: project?.coverColor || COVER_COLORS[0],
    startDate: project?.startDate || todayString(),
    dueDate: project?.dueDate || '',
    nextAction: project?.nextAction || '',
    tagsText: (project?.tags || []).join('、'),
    constraintsText: (project?.constraints || []).join('\n'),
    notes: project?.notes || '',
  }
}

export function ProjectFormModal({ open, onClose, project = null, onSaved }) {
  const { state, actions } = useApp()
  const toast = useToast()
  const isEdit = Boolean(project)

  const [form, setForm] = useState(() => initialState(project, state.settings.categories))
  const [nameError, setNameError] = useState('')

  const {
    suggestions,
    setSuggestions,
    suggesting,
    suggest,
    reset,
    selected,
    matches,
    source,
  } = useKnowledgeSuggestion()

  useEffect(() => {
    if (!open) return
    setForm(initialState(project, state.settings.categories))
    setNameError('')
    reset()
  }, [open, project, state.settings.categories, reset])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError('项目名称不能为空')
      return
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description,
      status: form.status,
      priority: form.priority,
      coverColor: form.coverColor,
      startDate: form.startDate || todayString(),
      dueDate: form.dueDate || null,
      nextAction: form.nextAction,
      constraints: normalizeConstraints(form.constraintsText),
      tags: form.tagsText
        .split(/[、,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      notes: form.notes,
    }

    if (isEdit) {
      actions.updateProject(project.id, payload)
      toast.success('项目已更新')
      onSaved?.(project.id)
    } else {
      const created = actions.createProject(payload)
      if (selected.length > 0) {
        const result = actions.addKnowledgeItems(created.id, selected)
        toast.success(
          `项目已创建，加入 ${result.added} 个知识点（其中 ${result.reused} 个复用了已有概念）`,
        )
      } else {
        toast.success('项目已创建')
      }
      onSaved?.(created.id)
    }
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑项目' : '新建项目'}
      description={
        isEdit ? '改完记得保存，进度会自动跟着任务走。' : '先填名称就行，其他都可以之后补。'
      }
      width={640}
      footer={
        <>
          <div className={styles.spacer} />
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {isEdit ? '保存' : '创建项目'}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <Field label="项目名称" required error={nameError} className={styles.span2}>
          <Input
            value={form.name}
            autoFocus
            onChange={(e) => {
              set({ name: e.target.value })
              if (nameError) setNameError('')
            }}
            placeholder="例如：街拍摄影作业"
          />
        </Field>

        <Field label="类别">
          <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {state.settings.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="优先级">
          <Select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="状态">
          <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {PROJECT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="标识色">
          <div className={styles.swatches}>
            {COVER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                data-selected={form.coverColor === color}
                style={{ background: color }}
                onClick={() => set({ coverColor: color })}
                aria-label={`选择颜色 ${color}`}
                aria-pressed={form.coverColor === color}
              />
            ))}
          </div>
        </Field>

        <Field
          label="项目描述"
          hint="写清楚想做出什么、给谁看。AI 生成知识点时会用到这段。"
          className={styles.span2}
        >
          <Textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="例如：摄影课的期末作业，交一组十二张照片，主题自定，再配一段说明。"
            rows={3}
          />
        </Field>

        {!isEdit && (
          <div className={styles.span2}>
            <div className={styles.suggestBar}>
              <Button
                size="sm"
                icon="✨"
                disabled={suggesting}
                onClick={() =>
                  suggest({
                    projectName: form.name,
                    category: form.category,
                    description: form.description,
                  })
                }
              >
                {suggesting ? '正在生成…' : 'AI 生成知识点建议'}
              </Button>
              <span className={styles.suggestHint}>
                按描述推荐需要补的基础知识，结果可以先挑再决定
              </span>
            </div>

            {suggesting && <SuggestionSkeleton />}
            {!suggesting && (
              <SuggestionList
                suggestions={suggestions}
                setSuggestions={setSuggestions}
                matches={matches}
                source={source}
              />
            )}
          </div>
        )}

        <Field label="开始日期">
          <Input
            type="date"
            value={form.startDate || ''}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </Field>

        <Field label="截止日期">
          <Input
            type="date"
            value={form.dueDate || ''}
            onChange={(e) => set({ dueDate: e.target.value })}
          />
        </Field>

        <Field
          label="下一步行动"
          hint="只写一件事，具体到能立刻动手。首页会把它顶到最显眼的位置。"
          className={styles.span2}
        >
          <Input
            value={form.nextAction}
            onChange={(e) => set({ nextAction: e.target.value })}
            placeholder="例如：把备选的照片排一遍，找出还缺哪几个场景"
          />
        </Field>

        <Field label="标签" hint="用顿号或逗号分隔" className={styles.span2}>
          <Input
            value={form.tagsText}
            onChange={(e) => set({ tagsText: e.target.value })}
            placeholder="摄影、作业"
          />
        </Field>

        <Field
          label="工具与限制"
          hint="一行一条。会原样填进项目 Prompt，让 AI 知道你的实际条件。"
          className={styles.span2}
        >
          <Textarea
            value={form.constraintsText}
            onChange={(e) => set({ constraintsText: e.target.value })}
            placeholder={'只能用免费工具\n不熟悉矩阵运算的向量化写法'}
            rows={3}
          />
        </Field>

        <Field label="备注" className={styles.span2}>
          <Textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="随手记的东西，只有自己看"
            rows={2}
          />
        </Field>
      </div>
    </Modal>
  )
}
